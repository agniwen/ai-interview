import { z } from "zod";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { interviewDataCollectionResultsSchema } from "@arc/shared/interview/question-outcomes";
import { questionCheckpointPayloadSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/question-checkpoint";

const transcriptTurnSchema = z.object({
  message: z.string(),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().optional(),
});

const jsonObjectSchema = z.record(z.string(), z.json());

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
  metadata: jsonObjectSchema.nullish(),
  // Agent 端 metrics_collected 聚合：STT/LLM/TTS/EOU/打断的会话级总览与每轮 e2e。
  // 原样落到 interview_conversation.metrics，后续 Studio 渲染延迟/用量面板时直接查。
  // Aggregates emitted by the agent's metrics_collected listener: STT/LLM/TTS/
  // EOU/interruption totals plus per-turn e2e latency. Persisted as-is so the
  // Studio dashboard can render latency/usage panels without re-shaping.
  metrics: jsonObjectSchema.nullish(),
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
export type ReportPayload = z.infer<typeof reportPayloadSchema>;
export type CheckpointPayload = z.infer<typeof questionCheckpointPayloadSchema>;
export type ReportTranscript = ReportPayload["transcript"];

export interface RetrySummaryCandidate {
  conversationId: string;
  interviewRecordId: string | null;
}

export interface AgentRouterDependencies {
  cacheTags: {
    interviewConversations: string;
    interviewConversationsByRecord: (id: string) => string;
    studioInterviews: (id: string) => string;
  };
  createInterviewEvidenceSnapshot: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  findExistingTranscript: (conversationId: string) => Promise<ReportTranscript | null>;
  hasKeyInformationColumns: () => Promise<boolean>;
  listKeyInformationRetryCandidates: (staleThreshold: Date) => Promise<RetrySummaryCandidate[]>;
  listSummaryRetryCandidates: (staleThreshold: Date) => Promise<RetrySummaryCandidate[]>;
  notifyInterviewSummaryReady: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  persistCheckpoint: (options: {
    data: CheckpointPayload;
    now: Date;
    organizationId: string;
  }) => Promise<void>;
  persistReport: (options: {
    data: ReportPayload;
    isNewTranscript: boolean;
    keyInformationColumnsAvailable: boolean;
    now: Date;
    organizationId: string;
  }) => Promise<void>;
  resolveOrgFromInterview: (interviewRecordId: string) => Promise<string>;
  retryFailedInterviewSummaryNotifications: () => Promise<{ retried: number }>;
  runKeyInformationJob: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  runSummaryJob: (options: { conversationId: string; interviewRecordId: string }) => Promise<void>;
  safeUpdateTag: (tag: string) => void;
}

export function createAgentRouter(dependencies: AgentRouterDependencies) {
  return (
    factory
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
        const organizationId = await dependencies.resolveOrgFromInterview(data.interviewRecordId);
        await dependencies.persistCheckpoint({ data, now, organizationId });

        dependencies.safeUpdateTag(dependencies.cacheTags.interviewConversations);
        dependencies.safeUpdateTag(
          dependencies.cacheTags.interviewConversationsByRecord(data.interviewRecordId),
        );
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
        const orgId = await dependencies.resolveOrgFromInterview(data.interviewRecordId);

        // Look up the existing conversation (if any) to decide whether the
        // incoming POST is a fresh transcript or an idempotent re-delivery.
        // - Fresh transcript → reset summary state so LLM re-runs.
        // - Same transcript as stored → leave summary state alone so a previously
        //   generated summary isn't clobbered by a retry / manual re-POST.
        const existingTranscript = await dependencies.findExistingTranscript(data.conversationId);

        const isNewTranscript =
          !existingTranscript ||
          JSON.stringify(existingTranscript) !== JSON.stringify(data.transcript);
        const keyInformationColumnsAvailable = await dependencies.hasKeyInformationColumns();

        await dependencies.persistReport({
          data,
          isNewTranscript,
          keyInformationColumnsAvailable,
          now,
          organizationId: orgId,
        });

        await dependencies.createInterviewEvidenceSnapshot({
          conversationId: data.conversationId,
          interviewRecordId: data.interviewRecordId,
        });

        // studio-interviews 已按 org 隔离（见 cache-tags.ts）；interview-conversations
        // 仍是全局 + record-id 两条，本来就足够 specific 无需 org 后缀。
        // studio-interviews is org-scoped now; interview-conversations stays
        // global + record-id (already specific enough).
        dependencies.safeUpdateTag(dependencies.cacheTags.studioInterviews(orgId));
        dependencies.safeUpdateTag(dependencies.cacheTags.interviewConversations);
        dependencies.safeUpdateTag(
          dependencies.cacheTags.interviewConversationsByRecord(data.interviewRecordId),
        );

        // 6. Fire-and-forget summary generation, but only when the transcript
        //    actually changed — skip for idempotent re-POSTs of an already-
        //    processed conversation. `runSummaryJob` has its own conditional
        //    claim, so even without this guard it would be safe; this just
        //    avoids an extra DB roundtrip for obvious duplicates.
        if (isNewTranscript) {
          void dependencies.runSummaryJob({
            conversationId: data.conversationId,
            interviewRecordId: data.interviewRecordId,
          });
          if (keyInformationColumnsAvailable) {
            void dependencies.runKeyInformationJob({
              conversationId: data.conversationId,
              interviewRecordId: data.interviewRecordId,
            });
          }
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
        const candidates = await dependencies.listSummaryRetryCandidates(staleThreshold);
        const retryable = candidates.slice(0, RECOVERY_BATCH_SIZE);

        const keyInformationCandidates =
          await dependencies.listKeyInformationRetryCandidates(staleThreshold);
        const keyInformationRetryable = keyInformationCandidates.slice(0, RECOVERY_BATCH_SIZE);

        for (const row of retryable) {
          if (!row.interviewRecordId) {
            continue;
          }
          void dependencies.runSummaryJob({
            conversationId: row.conversationId,
            interviewRecordId: row.interviewRecordId,
          });
        }

        for (const row of keyInformationRetryable) {
          if (!row.interviewRecordId) {
            continue;
          }
          void dependencies.runKeyInformationJob({
            conversationId: row.conversationId,
            interviewRecordId: row.interviewRecordId,
          });
        }

        return c.json({
          keyInformation: {
            retried: keyInformationRetryable.length,
            scanned: keyInformationCandidates.length,
            skipped: keyInformationCandidates.length - keyInformationRetryable.length,
          },
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
          await dependencies.notifyInterviewSummaryReady({
            conversationId: body.data.conversationId,
            interviewRecordId: body.data.interviewRecordId,
          });
          return c.json({ retried: 1, scoped: true }, 200);
        }

        const result = await dependencies.retryFailedInterviewSummaryNotifications();
        return c.json(result, 200);
      })
  );
}
