import { and, eq, inArray, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/server/db/schema";
import { factory } from "@/server/factory";
import { safeUpdateTag } from "@/server/cache-tags";
import { retryFailedInterviewSummaryNotifications } from "@/server/routes/agent/utils/feishu-interview-notifications";
import { runSummaryJob } from "@/server/routes/agent/utils/interview-summary-job";

const transcriptTurnSchema = z.object({
  message: z.string(),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().optional(),
});

const recordingPayloadSchema = z
  .object({
    durationSecs: z.number().int().nullish(),
    egressId: z.string().min(1),
    fileKey: z.string().min(1),
    status: z.enum(["pending", "active", "completed", "failed"]),
  })
  .nullish();

const reportPayloadSchema = z.object({
  agentId: z.string().nullish(),
  callSuccessful: z.string().nullish(),
  conversationId: z.string().min(1),
  endedAt: z.string().nullish(),
  interviewRecordId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  recording: recordingPayloadSchema,
  scheduleEntryId: z.string().min(1),
  startedAt: z.string().nullish(),
  status: z.string().default("completed"),
  transcript: z.array(transcriptTurnSchema).default([]),
});

const RECOVERY_STALE_MINUTES = 10;
const RECOVERY_BATCH_SIZE = 20;
const RECOVERY_MAX_ATTEMPTS = 5;

export const agentRouter = factory
  .createApp()
  .post("/report", async (c) => {
    const secret = c.req.header("X-Agent-Secret");
    const expectedSecret = process.env.AGENT_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = reportPayloadSchema.safeParse(await c.req.json());

    if (!body.success) {
      return c.json({ details: body.error.flatten(), error: "Invalid payload" }, 400);
    }

    const { data } = body;
    const now = new Date();

    // Look up the existing conversation (if any) to decide whether the
    // incoming POST is a fresh transcript or an idempotent re-delivery.
    // - Fresh transcript → reset summary state so LLM re-runs.
    // - Same transcript as stored → leave summary state alone so a previously
    //   generated summary isn't clobbered by a retry / manual re-POST.
    const [existing] = await db
      .select({ transcript: interviewConversation.transcript })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, data.conversationId))
      .limit(1);

    const isNewTranscript =
      !existing || JSON.stringify(existing.transcript ?? []) !== JSON.stringify(data.transcript);

    await db.transaction(async (tx) => {
      // 1. Upsert interviewConversation with raw transcript.
      //    summaryStatus is reset to `pending` only when the transcript
      //    actually changed; see the comment above.
      const summaryResetFields = isNewTranscript
        ? {
            evaluationCriteriaResults: {},
            summaryAttempts: 0,
            summaryError: null,
            summaryStartedAt: null,
            summaryStatus: "pending" as const,
            transcriptSummary: null,
          }
        : {};

      // 录像字段：仅当 agent 上报了 recording 才写入，避免重传清空已有元数据。
      // Recording columns: only set when the report carries recording info, so an
      // idempotent retransmit doesn't blank out previously stored metadata.
      const recordingFields = data.recording
        ? {
            recordingDurationSecs: data.recording.durationSecs ?? null,
            recordingEgressId: data.recording.egressId,
            recordingFileKey: data.recording.fileKey,
            recordingStatus: data.recording.status,
          }
        : {};

      await tx
        .insert(interviewConversation)
        .values({
          agentId: data.agentId ?? null,
          callSuccessful: data.callSuccessful ?? null,
          conversationId: data.conversationId,
          dataCollectionResults: {},
          dynamicVariables: {},
          endedAt: data.endedAt ? new Date(data.endedAt) : null,
          interviewRecordId: data.interviewRecordId,
          lastSyncedAt: now,
          metadata: data.metadata ?? {},
          mode: "voice",
          scheduleEntryId: data.scheduleEntryId,
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
          status: data.status,
          summaryStatus: "pending",
          transcript: data.transcript,
          webhookReceivedAt: now,
          ...recordingFields,
        })
        .onConflictDoUpdate({
          set: {
            callSuccessful: data.callSuccessful ?? null,
            endedAt: data.endedAt ? new Date(data.endedAt) : null,
            lastSyncedAt: now,
            metadata: data.metadata ?? {},
            startedAt: data.startedAt ? new Date(data.startedAt) : null,
            status: data.status,
            transcript: data.transcript,
            webhookReceivedAt: now,
            ...summaryResetFields,
            ...recordingFields,
          },
          target: interviewConversation.conversationId,
        });

      // 2. Replace turns
      await tx
        .delete(interviewConversationTurn)
        .where(eq(interviewConversationTurn.conversationId, data.conversationId));

      if (data.transcript.length > 0) {
        const callStart = data.startedAt ? new Date(data.startedAt) : now;

        await tx.insert(interviewConversationTurn).values(
          data.transcript.map((turn, index) => ({
            conversationId: data.conversationId,
            createdAt: new Date(callStart.getTime() + (turn.timeInCallSecs ?? 0) * 1000),
            id: `${data.conversationId}:turn:${index}`,
            interviewRecordId: data.interviewRecordId,
            message: turn.message,
            receivedAt: now,
            role: turn.role,
            source: "agent_report" as const,
            timeInCallSecs:
              turn.timeInCallSecs === null || turn.timeInCallSecs === undefined
                ? null
                : Math.round(turn.timeInCallSecs),
          })),
        );
      }

      // 3. Update schedule entry → completed.
      // 加 liveKitRoomName 校验防止"stale agent"覆盖：场景为管理员在 grace
      // 期间 reset 了一轮（清掉 anchor），候选人重新开始（mint 了新 anchor），
      // 但旧 grace 超时后 agent shutdown 上报到这里——若不校验会把已被新会话
      // 占用的 schedule 行写成 completed。conversationId 在 agent 端 ===
      // ctx.room.name === schedule.liveKitRoomName，只接受当前 anchor 匹配的写。
      // Guard against stale agent reports overwriting a freshly reset round:
      // require schedule.liveKitRoomName === conversationId. Mismatch means
      // this report is from a previous lifecycle and must not cascade.
      const updatedSchedule = await tx
        .update(studioInterviewSchedule)
        .set({
          conversationId: data.conversationId,
          status: "completed" as const,
          updatedAt: now,
        })
        .where(
          and(
            eq(studioInterviewSchedule.id, data.scheduleEntryId),
            eq(studioInterviewSchedule.liveKitRoomName, data.conversationId),
          ),
        )
        .returning({ id: studioInterviewSchedule.id });

      const cascaded = updatedSchedule.length > 0;

      // 4. If all rounds completed → interview completed.
      //    跳过级联当 schedule 不匹配（被 reset / 被新会话接管），避免误把
      //    studioInterview 整体置 completed。transcript（interviewConversation）
      //    照常落库，后续可以人工核对。
      //    Skip cascading when the schedule update was rejected (round reset
      //    or taken over by a newer session). Transcript still lands on the
      //    interview_conversation row and remains auditable.
      if (cascaded) {
        const pendingRounds = await tx
          .select({ id: studioInterviewSchedule.id })
          .from(studioInterviewSchedule)
          .where(
            and(
              eq(studioInterviewSchedule.interviewRecordId, data.interviewRecordId),
              ne(studioInterviewSchedule.status, "completed"),
            ),
          );

        if (pendingRounds.length === 0) {
          await tx
            .update(studioInterview)
            .set({ status: "completed" as const, updatedAt: now })
            .where(eq(studioInterview.id, data.interviewRecordId));
        }
      }

      // 5. Audit
      await tx.insert(interviewAuditLog).values({
        action: "agent_report_received",
        createdAt: now,
        detail: {
          callSuccessful: data.callSuccessful,
          conversationId: data.conversationId,
          turnCount: data.transcript.length,
        },
        id: crypto.randomUUID(),
        interviewRecordId: data.interviewRecordId,
        operatorId: null,
        scheduleEntryId: data.scheduleEntryId,
      });
    });

    safeUpdateTag("studio-interviews");
    safeUpdateTag("interview-conversations");
    safeUpdateTag(`interview-conversations-${data.interviewRecordId}`);

    // 6. Fire-and-forget summary generation, but only when the transcript
    //    actually changed — skip for idempotent re-POSTs of an already-
    //    processed conversation. `runSummaryJob` has its own conditional
    //    claim, so even without this guard it would be safe; this just
    //    avoids an extra DB roundtrip for obvious duplicates.
    if (isNewTranscript) {
      void runSummaryJob({
        conversationId: data.conversationId,
        interviewRecordId: data.interviewRecordId,
      });
    }

    return c.json({ conversationId: data.conversationId, success: true }, 201);
  })
  // Recovery endpoint — scans for stuck summaries and re-triggers them.
  // Call via cron (docker scheduler, Github Actions, etc.) or manually.
  // Same secret header as /report so it's not publicly hittable.
  .post("/retry-summaries", async (c) => {
    const secret = c.req.header("X-Agent-Secret");
    const expectedSecret = process.env.AGENT_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const staleThreshold = new Date(Date.now() - RECOVERY_STALE_MINUTES * 60 * 1000);

    // Candidates: still pending (fire-and-forget never ran / crashed during run),
    // stuck in running past the threshold (process died mid-LLM),
    // or previously failed (transient LLM error).
    const candidates = await db
      .select({
        conversationId: interviewConversation.conversationId,
        interviewRecordId: interviewConversation.interviewRecordId,
        summaryAttempts: interviewConversation.summaryAttempts,
      })
      .from(interviewConversation)
      .where(
        and(
          or(
            inArray(interviewConversation.summaryStatus, ["pending", "failed"]),
            and(
              eq(interviewConversation.summaryStatus, "running"),
              lt(interviewConversation.summaryStartedAt, staleThreshold),
            ),
          ),
          lt(interviewConversation.updatedAt, staleThreshold),
        ),
      )
      .limit(RECOVERY_BATCH_SIZE);

    const retryable = candidates.filter(
      (row) => row.interviewRecordId && row.summaryAttempts < RECOVERY_MAX_ATTEMPTS,
    );

    for (const row of retryable) {
      if (!row.interviewRecordId) {
        continue;
      }
      void runSummaryJob({
        conversationId: row.conversationId,
        interviewRecordId: row.interviewRecordId,
      });
    }

    return c.json({
      retried: retryable.length,
      scanned: candidates.length,
      skipped: candidates.length - retryable.length,
    });
  })
  .post("/retry-notifications", async (c) => {
    const secret = c.req.header("X-Agent-Secret");
    const expectedSecret = process.env.AGENT_CALLBACK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const result = await retryFailedInterviewSummaryNotifications();
    return c.json(result);
  });
