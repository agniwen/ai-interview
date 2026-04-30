import { EgressStatus } from "@livekit/protocol";
import { eq } from "drizzle-orm";
import { WebhookReceiver } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { interviewConversation } from "@/lib/db/schema";
import { factory } from "@/server/factory";
import { safeUpdateTag } from "@/server/routes/interview/utils";

type RecordingStatus = "pending" | "active" | "completed" | "failed";

function mapEgressStatus(status: EgressStatus): RecordingStatus {
  if (status === EgressStatus.EGRESS_COMPLETE) {
    return "completed";
  }
  if (
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED
  ) {
    return "failed";
  }
  return "active";
}

function deriveDurationSecs(startedAt: bigint, endedAt: bigint): number | null {
  const zero = 0n;
  if (startedAt <= zero || endedAt <= zero || endedAt < startedAt) {
    return null;
  }
  return Number((endedAt - startedAt) / 1_000_000_000n);
}

let cachedReceiver: WebhookReceiver | null = null;

function getReceiver(): WebhookReceiver | null {
  if (cachedReceiver) {
    return cachedReceiver;
  }
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!(apiKey && apiSecret)) {
    return null;
  }
  cachedReceiver = new WebhookReceiver(apiKey, apiSecret);
  return cachedReceiver;
}

export const livekitRouter = factory.createApp().post("/webhook", async (c) => {
  const receiver = getReceiver();
  if (!receiver) {
    return c.json({ error: "LIVEKIT_API_KEY/SECRET not configured" }, 500);
  }

  const body = await c.req.text();
  const authHeader = c.req.header("Authorization");

  let event: Awaited<ReturnType<WebhookReceiver["receive"]>>;
  try {
    event = await receiver.receive(body, authHeader);
  } catch (error) {
    console.error("livekit webhook signature verification failed", error);
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Egress 完整生命周期: started → updated* → ended.
  // 只有 ended 才能确定最终上传是否成功；updated 仅是中间进度，跳过避免覆盖最终状态。
  // Egress full lifecycle: started → updated* → ended. Only ended is terminal,
  // so we skip updated to avoid overwriting the final status.
  if (event.event !== "egress_ended") {
    return c.json({ ignored: event.event, ok: true });
  }

  const info = event.egressInfo;
  if (!info?.egressId) {
    return c.json({ ignored: "missing-egress-id", ok: true });
  }

  const recordingStatus = mapEgressStatus(info.status);
  const durationSecs = deriveDurationSecs(info.startedAt, info.endedAt);

  const updated = await db
    .update(interviewConversation)
    .set({
      lastSyncedAt: new Date(),
      recordingDurationSecs: durationSecs,
      recordingStatus,
    })
    .where(eq(interviewConversation.recordingEgressId, info.egressId))
    .returning({ interviewRecordId: interviewConversation.interviewRecordId });

  if (updated.length === 0) {
    // Webhook 比 agent 的 /report 更早到达时会出现这种情况；返回 200 让 LiveKit 不重投，
    // 由后续 agent /report 写入 status="active" 的初始记录后再交由人工/重试机制兜底。
    // Race: webhook arrives before agent's /report. Return 200 so LiveKit doesn't
    // retry; the row will be backfilled when /report lands.
    console.warn("livekit egress_ended for unknown egressId", info.egressId);
    return c.json({ matched: 0, ok: true });
  }

  safeUpdateTag("interview-conversations");
  for (const row of updated) {
    safeUpdateTag(`interview-conversations-${row.interviewRecordId}`);
  }

  return c.json({ matched: updated.length, ok: true });
});
