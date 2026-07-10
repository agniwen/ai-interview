import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import {
  getResumeParseQueueStats,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { getResumeReviewGenerationQueueStats } from "@arc/resume-parse-queue/resume-review-generation";
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
      console.error("[worker] readiness check failed", error);
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

  app.get("/queues/resume-parse/stats", async (c) => {
    const stats = await getResumeParseQueueStats();
    return c.json(stats, 200);
  });

  app.get("/queues/resume-review-generation/stats", async (c) => {
    const stats = await getResumeReviewGenerationQueueStats();
    return c.json(stats, 200);
  });

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  return app;
}
