import { and, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewAuditLog,
  interviewConversation,
  interviewConversationTurn,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import {
  notifyInterviewSummaryReady,
  retryFailedInterviewSummaryNotifications,
} from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-interview-notifications";
import { runSummaryJob } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-summary-job";
import { createInterviewEvidenceSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot";
import {
  interviewDataCollectionResultsSchema,
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import { questionCheckpointPayloadSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/question-checkpoint";

async function resolveOrgFromInterview(interviewRecordId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  if (!row) {
    throw new Error(`resolveOrgFromInterview: studio_interview ${interviewRecordId} not found`);
  }
  return row.organizationId;
}

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
  dataCollectionResults: interviewDataCollectionResultsSchema.nullish(),
  endedAt: z.string().nullish(),
  interviewRecordId: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  // Agent 端 metrics_collected 聚合：STT/LLM/TTS/EOU/打断的会话级总览与每轮 e2e。
  // 原样落到 interview_conversation.metrics，后续 Studio 渲染延迟/用量面板时直接查。
  // Aggregates emitted by the agent's metrics_collected listener: STT/LLM/TTS/
  // EOU/interruption totals plus per-turn e2e latency. Persisted as-is so the
  // Studio dashboard can render latency/usage panels without re-shaping.
  metrics: z.record(z.string(), z.unknown()).nullish(),
  recording: recordingPayloadSchema,
  scheduleEntryId: z.string().min(1),
  startedAt: z.string().nullish(),
  status: z.string().default("completed"),
  transcript: z.array(transcriptTurnSchema).default([]),
});

const retryNotificationPayloadSchema = z
  .object({
    conversationId: z.string().min(1),
    interviewRecordId: z.string().min(1),
  })
  .partial();

const RECOVERY_STALE_MINUTES = 10;
const RECOVERY_BATCH_SIZE = 20;
const RECOVERY_MAX_ATTEMPTS = 5;

export const agentRouter = factory
  .createApp()
  .post("/checkpoint", async (c) => {
    const secret = c.req.header("X-Agent-Secret");
    const expectedSecret = process.env.AGENT_CALLBACK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = questionCheckpointPayloadSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json({ details: body.error.flatten(), error: "Invalid payload" }, 400);
    }

    const { data } = body;
    const now = new Date();
    const orgId = await resolveOrgFromInterview(data.interviewRecordId);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ dataCollectionResults: interviewConversation.dataCollectionResults })
        .from(interviewConversation)
        .where(eq(interviewConversation.conversationId, data.conversationId))
        .for("update")
        .limit(1);
      const current = parseInterviewDataCollectionResults(existing?.dataCollectionResults) ?? {
        questions: [],
        schemaVersion: 2 as const,
      };
      const merged = mergeInterviewQuestionOutcome(current, data.outcome);

      if (existing) {
        await tx
          .update(interviewConversation)
          .set({
            dataCollectionResults: merged,
            lastSyncedAt: now,
          })
          .where(eq(interviewConversation.conversationId, data.conversationId));
        return;
      }

      await tx.insert(interviewConversation).values({
        conversationId: data.conversationId,
        dataCollectionResults: merged,
        interviewRecordId: data.interviewRecordId,
        lastSyncedAt: now,
        mode: "voice",
        organizationId: orgId,
        scheduleEntryId: data.scheduleEntryId,
        status: "in_progress",
      });
    });

    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(data.interviewRecordId));
    return c.json({ success: true }, 201);
  })
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

    // Resolve organization from the interview record so all child rows carry
    // the correct tenant scope even though this webhook has no user session.
    const orgId = await resolveOrgFromInterview(data.interviewRecordId);

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
      const dataCollectionFields = data.dataCollectionResults
        ? { dataCollectionResults: data.dataCollectionResults }
        : {};

      await tx
        .insert(interviewConversation)
        .values({
          agentId: data.agentId ?? null,
          callSuccessful: data.callSuccessful ?? null,
          conversationId: data.conversationId,
          dataCollectionResults: data.dataCollectionResults ?? {},
          dynamicVariables: {},
          endedAt: data.endedAt ? new Date(data.endedAt) : null,
          interviewRecordId: data.interviewRecordId,
          lastSyncedAt: now,
          metadata: data.metadata ?? {},
          metrics: data.metrics ?? {},
          mode: "voice",
          organizationId: orgId,
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
            metrics: data.metrics ?? {},
            startedAt: data.startedAt ? new Date(data.startedAt) : null,
            status: data.status,
            transcript: data.transcript,
            webhookReceivedAt: now,
            ...summaryResetFields,
            ...recordingFields,
            ...dataCollectionFields,
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
            organizationId: orgId,
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
      await tx
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
        );

      // 4. Audit. Candidate lifecycle remains in pipelineStage/outcome; this
      // report only completes the matching AI Interview Round.
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
        organizationId: orgId,
        scheduleEntryId: data.scheduleEntryId,
      });
    });

    await createInterviewEvidenceSnapshot({
      conversationId: data.conversationId,
      interviewRecordId: data.interviewRecordId,
    });

    // studio-interviews 已按 org 隔离（见 cache-tags.ts）；interview-conversations
    // 仍是全局 + record-id 两条，本来就足够 specific 无需 org 后缀。
    // studio-interviews is org-scoped now; interview-conversations stays
    // global + record-id (already specific enough).
    safeUpdateTag(cacheTags.studioInterviews(orgId));
    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(data.interviewRecordId));

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

    const rawBody = await c.req.json().catch(() => null);
    const body = retryNotificationPayloadSchema.safeParse(rawBody ?? {});
    if (!body.success) {
      return c.json({ details: body.error.flatten(), error: "Invalid payload" }, 400);
    }

    if (body.data.conversationId && body.data.interviewRecordId) {
      await notifyInterviewSummaryReady({
        conversationId: body.data.conversationId,
        interviewRecordId: body.data.interviewRecordId,
      });
      return c.json({ retried: 1, scoped: true });
    }

    const result = await retryFailedInterviewSummaryNotifications();
    return c.json(result);
  });
