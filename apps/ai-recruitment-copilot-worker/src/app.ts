import { Hono } from "hono";
import {
  getResumeParseQueueStats,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { pingDatabase } from "./db";
import { getResumeParseReadinessIssue } from "./parse-config";

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
      return c.json(
        {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        },
        503,
      );
    }
  });

  app.get("/queues/resume-parse/stats", async (c) => {
    const stats = await getResumeParseQueueStats();
    return c.json(stats, 200);
  });

  app.notFound((c) => c.json({ error: "Not Found" }, 404));

  return app;
}
