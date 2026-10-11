import { factory } from "../../factory";
import { questionCheckpointPayloadSchema } from "@app/recruiting-workflows/ai-interview-reports/question-checkpoint";
import type { AgentRouterDependencies } from "@app/recruiting-workflows/ai-interview-reports/agent-report-dependencies";
import {
  reportPayloadSchema,
  retryNotificationPayloadSchema,
} from "@app/recruiting-workflows/ai-interview-reports/report-payload";

const RECOVERY_STALE_MINUTES = 10;
const RECOVERY_BATCH_SIZE = 20;

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
        await dependencies.receiveReport(data, dependencies);

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
