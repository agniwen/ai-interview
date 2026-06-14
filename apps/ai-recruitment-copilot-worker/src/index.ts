import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import {
  closeResumeParseQueue,
  createResumeParseWorker,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { createWorkerApp } from "./app";
import { resolveWorkerServerConfig } from "./config";
import { getWorkerConnectionSummary, loadWorkerEnv } from "./env";
import { getResumeParseConfigSummary } from "./parse-config";

loadWorkerEnv();

async function recoverIncompleteResumeParseJobs(): Promise<void> {
  const { recoverIncompleteBatchItems } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches");
  const { enqueueResumeParseJobs } = await import("@arc/resume-parse-queue/resume-parse");
  const jobs = await recoverIncompleteBatchItems();
  if (jobs.length === 0) {
    console.info("[resume-parse-worker] startup recovery found no pending items");
    return;
  }
  await enqueueResumeParseJobs(jobs);
  console.info("[resume-parse-worker] startup recovery enqueued items", {
    count: jobs.length,
  });
}

async function main() {
  const { hostname, port } = resolveWorkerServerConfig();
  const app = createWorkerApp();
  const server = serve({
    fetch: app.fetch,
    hostname,
    port,
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[worker] ${hostname}:${port} is already in use.`);
    } else {
      console.error("[worker] server error:", error);
    }
    process.exit(1);
  });
  const closeServer = promisify(server.close.bind(server));

  let worker: ReturnType<typeof createResumeParseWorker> | null = null;
  if (isResumeParseQueueConfigured()) {
    await recoverIncompleteResumeParseJobs();
    worker = createResumeParseWorker(async ({ itemId }) => {
      const { processBatchItem } =
        await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor");
      await processBatchItem(itemId);
    });
  }
  if (!worker) {
    console.warn("[worker] REDIS_URL is not set; resume parse worker is not started.");
  }

  console.info(`[worker] listening on http://${hostname}:${port}`);
  console.info("[worker] connection config", getWorkerConnectionSummary());
  console.info("[worker] resume parse config", getResumeParseConfigSummary());

  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      try {
        console.info(`[worker] shutting down after ${signal}`);
        await closeServer();
        await worker?.close();
        await closeResumeParseQueue();
        if (process.env.DATABASE_URL) {
          const { closeDatabase } =
            await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
          await closeDatabase();
        }
        process.exit(0);
      } catch (error) {
        console.error(`[worker] failed to shut down after ${signal}:`, error);
        process.exit(1);
      }
    })();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
