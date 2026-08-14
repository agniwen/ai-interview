import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import {
  getResumeParseQueueStats,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { getResumeReviewGenerationQueueStats } from "@arc/resume-parse-queue/resume-review-generation";
import { getMeetingIntelligenceQueueStats } from "@arc/meeting-processing-queue/meeting-intelligence";
import { getMeetingPlaybackQueueStats } from "@arc/meeting-processing-queue/meeting-playback";
import { getMeetingTranscriptionQueueStats } from "@arc/meeting-processing-queue/meeting-transcription";
import { getResumeParseReadinessIssue } from "./parse-config";

async function pingDatabase(): Promise<void> {
  const { pingDatabase: pingBackendDatabase } =
    await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
  await pingBackendDatabase();
}

export function createWorkerApp() {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }, 200));

  app.get("/readyz", async (c) => {
    if (!isResumeParseQueueConfigured()) {
      return c.json({ ok: false, reason: "REDIS_URL is not set" }, 503);
    }
    const parseConfigIssue = getResumeParseReadinessIssue();
    if (parseConfigIssue) {
      return c.json({ ok: false, reason: parseConfigIssue }, 503);
    }
    try {
      await pingDatabase();
      await getResumeParseQueueStats();
      return c.json({ ok: true }, 200);
    } catch (error) {
      console.error("[worker] readiness check failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return c.json({ ok: false, reason: "Dependency check failed" }, 503);
    }
  });

  app.use(
    "/queues/*",
    bearerAuth({
      verifyToken: (token) => {
        const expected = process.env.WORKER_DIAGNOSTICS_SECRET?.trim();
        return Boolean(expected) && token === expected;
      },
    }),
  );
  app.use(
    "/operations/*",
    bearerAuth({
      verifyToken: (token) => {
        const expected = process.env.WORKER_DIAGNOSTICS_SECRET?.trim();
        return Boolean(expected) && token === expected;
      },
    }),
  );

  app.get("/queues/resume-parse/stats", async (c) => {
    const stats = await getResumeParseQueueStats();
    return c.json(stats, 200);
  });

  app.get("/queues/resume-review-generation/stats", async (c) => {
    const stats = await getResumeReviewGenerationQueueStats();
    return c.json(stats, 200);
  });

  app.get("/operations/meetings", async (c) => {
    const { loadMeetingOperationsSnapshot } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/operations-dao");
    const [database, mediaFinalization, finalTranscription, intelligence] = await Promise.all([
      loadMeetingOperationsSnapshot(),
      getMeetingPlaybackQueueStats(),
      getMeetingTranscriptionQueueStats(),
      getMeetingIntelligenceQueueStats(),
    ]);
    return c.json(
      {
        ...database,
        queues: { finalTranscription, intelligence, mediaFinalization },
      },
      200,
    );
  });

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  return app;
}
