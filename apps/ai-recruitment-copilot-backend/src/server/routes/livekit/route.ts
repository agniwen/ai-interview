import { EgressStatus } from "@livekit/protocol";
import { eq } from "drizzle-orm";
import { WebhookReceiver } from "livekit-server-sdk";
import type { InterviewRecordingStatus } from "@arc/db-schema/db-enums";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewConversation } from "@arc/db-schema/schema";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import {
  endHumanInterviewMeetingByRoomName,
  markHumanInterviewMeetingInProgressByRoomName,
  markHumanInterviewParticipantJoined,
  markHumanInterviewParticipantLeft,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meetings";

function mapEgressStatus(status: EgressStatus): InterviewRecordingStatus {
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

async function handleHumanInterviewWebhook(
  event: Awaited<ReturnType<WebhookReceiver["receive"]>>,
): Promise<boolean> {
  const roomName = event.room?.name;
  if (!roomName?.startsWith("human_")) {
    return false;
  }

  if (event.event === "room_started") {
    await markHumanInterviewMeetingInProgressByRoomName(roomName);
  }
  if (event.event === "participant_joined" && event.participant?.identity) {
    await markHumanInterviewParticipantJoined({
      identity: event.participant.identity,
      roomName,
    });
  }
  if (event.event === "participant_left" && event.participant?.identity) {
    await markHumanInterviewParticipantLeft({
      identity: event.participant.identity,
      roomName,
    });
  }
  if (event.event === "room_finished") {
    await endHumanInterviewMeetingByRoomName(roomName);
  }

  safeUpdateTag("studio-interviews");
  return true;
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

  const humanInterviewHandled = await handleHumanInterviewWebhook(event);
  if (humanInterviewHandled) {
    return c.json({ handled: "human-interview", ok: true });
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

  safeUpdateTag(cacheTags.interviewConversations);
  for (const row of updated) {
    if (row.interviewRecordId) {
      safeUpdateTag(cacheTags.interviewConversationsByRecord(row.interviewRecordId));
    }
  }

  return c.json({ matched: updated.length, ok: true });
});
