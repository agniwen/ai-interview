import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import {
  closeResumeParseQueue,
  createResumeParseWorker,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import {
  closeResumeSemanticIndexQueue,
  createResumeSemanticIndexWorker,
  enqueueResumeSemanticIndexJobs,
} from "@arc/resume-parse-queue/resume-semantic-index";
import {
  closeResumeReviewGenerationQueue,
  createResumeReviewGenerationWorker,
} from "@arc/resume-parse-queue/resume-review-generation";
import {
  closeMeetingAnswerQueue,
  createMeetingAnswerWorker,
  enqueueMeetingAnswerJobs,
  isMeetingAnswerQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-answer";
import {
  closeMeetingIntelligenceQueue,
  createMeetingIntelligenceWorker,
  enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  closeMeetingPlaybackQueue,
  createMeetingPlaybackWorker,
  enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-playback";
import {
  closeMeetingPurgeQueue,
  createMeetingPurgeWorker,
  enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-purge";
import {
  closeMeetingTranscriptionQueue,
  createMeetingTranscriptionWorker,
  enqueueMeetingTranscriptionJobs,
  isMeetingTranscriptionQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { listMeetingTranscriptionProviderCandidates } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider-registry";
import { createWorkerApp } from "./app";
import { resolveWorkerServerConfig } from "./config";
import { getWorkerConnectionSummary, loadWorkerEnv } from "./env";
import { getResumeParseConfigSummary } from "./parse-config";
import { startMailIngestScheduler } from "./mail-ingest/scheduler";
import type { MailIngestScheduler } from "./mail-ingest/scheduler";

loadWorkerEnv();

function isResumeSemanticIndexEnabled(): boolean {
  const value = process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

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

async function recoverIncompleteResumeSemanticIndexJobs(): Promise<void> {
  const { listRecoverableResumeSemanticIndexJobs } =
    await import("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer");
  const jobs = await listRecoverableResumeSemanticIndexJobs();
  if (jobs.length === 0) {
    console.info("[resume-semantic-index-worker] startup recovery found no pending sources");
    return;
  }
  await enqueueResumeSemanticIndexJobs(jobs);
  console.info("[resume-semantic-index-worker] startup recovery enqueued sources", {
    count: jobs.length,
  });
}

async function recoverIncompleteMeetingPlaybackJobs(): Promise<void> {
  const { listRecoverableMeetingPlaybackJobs } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/dao");
  const jobs = await listRecoverableMeetingPlaybackJobs();
  if (jobs.length === 0) {
    console.info("[meeting-playback-worker] startup recovery found no pending meetings");
    return;
  }
  await enqueueMeetingPlaybackJobs(jobs);
  console.info("[meeting-playback-worker] startup recovery enqueued meetings", {
    count: jobs.length,
  });
}

async function recoverIncompleteMeetingPurgeJobs(): Promise<void> {
  const { listRecoverableMeetingPurgeJobs } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/lifecycle-dao");
  const jobs = await listRecoverableMeetingPurgeJobs();
  if (jobs.length === 0) {
    console.info("[meeting-purge-worker] recovery found no due meetings");
    return;
  }
  await enqueueMeetingPurgeJobs(jobs);
  console.info("[meeting-purge-worker] recovery enqueued meetings", { count: jobs.length });
}

async function recoverIncompleteMeetingAnswerJobs(): Promise<void> {
  const { listRecoverableMeetingAnswerJobs } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/answers/dao");
  const jobs = await listRecoverableMeetingAnswerJobs();
  if (jobs.length === 0) {
    console.info("[meeting-answer-worker] recovery found no pending exchanges");
    return;
  }
  await enqueueMeetingAnswerJobs(jobs);
  console.info("[meeting-answer-worker] recovery enqueued exchanges", { count: jobs.length });
}

async function recoverIncompleteMeetingIntelligenceJobs(): Promise<void> {
  const { listMeetingsNeedingAutomaticIntelligence, listRecoverableMeetingIntelligenceJobs } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/dao");
  const { requestAutomaticMeetingIntelligence } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/service");
  const missing = await listMeetingsNeedingAutomaticIntelligence();
  for (const meeting of missing) {
    try {
      await requestAutomaticMeetingIntelligence(meeting);
    } catch (error) {
      console.error("[meeting-intelligence-worker] failed to recover missing meeting", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        meetingId: meeting.meetingId,
        organizationId: meeting.organizationId,
      });
    }
  }
  const jobs = await listRecoverableMeetingIntelligenceJobs();
  if (jobs.length === 0) {
    console.info("[meeting-intelligence-worker] recovery found no pending runs");
    return;
  }
  await enqueueMeetingIntelligenceJobs(jobs);
  console.info("[meeting-intelligence-worker] recovery enqueued runs", { count: jobs.length });
}

async function recoverIncompleteMeetingTranscriptionJobs(): Promise<void> {
  const { listRecoverableMeetingTranscriptionJobs } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/dao");
  const jobs = await listRecoverableMeetingTranscriptionJobs();
  if (jobs.length === 0) {
    console.info("[meeting-transcription-worker] recovery found no pending meetings");
    return;
  }
  await enqueueMeetingTranscriptionJobs(jobs);
  console.info("[meeting-transcription-worker] recovery enqueued meetings", {
    count: jobs.length,
  });
}

let meetingPlaybackRecoveryRunning = false;
let meetingPurgeRecoveryRunning = false;
let meetingAnswerRecoveryRunning = false;
let meetingIntelligenceRecoveryRunning = false;
let meetingTranscriptionRecoveryRunning = false;

async function reconcileMeetingIntelligenceJobs(): Promise<void> {
  if (meetingIntelligenceRecoveryRunning) {
    return;
  }
  meetingIntelligenceRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingIntelligenceJobs();
  } catch (error) {
    console.error("[meeting-intelligence-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingIntelligenceRecoveryRunning = false;
  }
}

async function reconcileMeetingAnswerJobs(): Promise<void> {
  if (meetingAnswerRecoveryRunning) {
    return;
  }
  meetingAnswerRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingAnswerJobs();
  } catch (error) {
    console.error("[meeting-answer-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingAnswerRecoveryRunning = false;
  }
}

async function reconcileMeetingPlaybackJobs(): Promise<void> {
  if (meetingPlaybackRecoveryRunning) {
    return;
  }
  meetingPlaybackRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingPlaybackJobs();
  } catch (error) {
    console.error("[meeting-playback-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingPlaybackRecoveryRunning = false;
  }
}

async function reconcileMeetingPurgeJobs(): Promise<void> {
  if (meetingPurgeRecoveryRunning) {
    return;
  }
  meetingPurgeRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingPurgeJobs();
  } catch (error) {
    console.error("[meeting-purge-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingPurgeRecoveryRunning = false;
  }
}

async function reconcileMeetingTranscriptionJobs(): Promise<void> {
  if (meetingTranscriptionRecoveryRunning) {
    return;
  }
  meetingTranscriptionRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingTranscriptionJobs();
  } catch (error) {
    console.error("[meeting-transcription-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingTranscriptionRecoveryRunning = false;
  }
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
      console.error("[worker] server error", { errorName: error.name });
    }
    process.exit(1);
  });
  const closeServer = promisify(server.close.bind(server));

  let worker: ReturnType<typeof createResumeParseWorker> | null = null;
  let semanticIndexWorker: ReturnType<typeof createResumeSemanticIndexWorker> | null = null;
  let reviewGenerationWorker: ReturnType<typeof createResumeReviewGenerationWorker> | null = null;
  let mailIngestScheduler: MailIngestScheduler | null = null;
  let meetingAnswerWorker: ReturnType<typeof createMeetingAnswerWorker> | null = null;
  let meetingAnswerRecoveryTimer: NodeJS.Timeout | null = null;
  let meetingIntelligenceWorker: ReturnType<typeof createMeetingIntelligenceWorker> | null = null;
  let meetingIntelligenceRecoveryTimer: NodeJS.Timeout | null = null;
  let meetingPlaybackWorker: ReturnType<typeof createMeetingPlaybackWorker> | null = null;
  let meetingPlaybackRecoveryTimer: NodeJS.Timeout | null = null;
  let meetingPurgeWorker: ReturnType<typeof createMeetingPurgeWorker> | null = null;
  let meetingPurgeRecoveryTimer: NodeJS.Timeout | null = null;
  let meetingTranscriptionWorker: ReturnType<typeof createMeetingTranscriptionWorker> | null = null;
  let meetingTranscriptionRecoveryTimer: NodeJS.Timeout | null = null;
  if (isMeetingAnswerQueueConfigured()) {
    meetingAnswerWorker = createMeetingAnswerWorker(async (payload, context) => {
      const [{ defaultMeetingAnswerDependencies }, { runMeetingAnswerProcessing }] =
        await Promise.all([
          import("./meeting-answer/default-dependencies"),
          import("./meeting-answer/processor"),
        ]);
      await runMeetingAnswerProcessing(payload, context, defaultMeetingAnswerDependencies);
    });
    await reconcileMeetingAnswerJobs();
    meetingAnswerRecoveryTimer = setInterval(() => {
      void reconcileMeetingAnswerJobs();
    }, 60_000);
    meetingAnswerRecoveryTimer.unref();
  }
  if (isMeetingProcessingQueueConfigured()) {
    meetingPlaybackWorker = createMeetingPlaybackWorker(async (payload) => {
      const { defaultMeetingPlaybackDependencies } =
        await import("./meeting-playback/default-dependencies");
      const { runMeetingPlaybackProcessing } = await import("./meeting-playback/processor");
      await runMeetingPlaybackProcessing(payload, defaultMeetingPlaybackDependencies);
    });
    await reconcileMeetingPlaybackJobs();
    meetingPlaybackRecoveryTimer = setInterval(() => {
      void reconcileMeetingPlaybackJobs();
    }, 60_000);
    meetingPlaybackRecoveryTimer.unref();
  }
  if (isMeetingPurgeQueueConfigured()) {
    meetingPurgeWorker = createMeetingPurgeWorker(async (payload) => {
      const { defaultMeetingPurgeDependencies } =
        await import("./meeting-purge/default-dependencies");
      const { runMeetingPurgeProcessing } = await import("./meeting-purge/processor");
      await runMeetingPurgeProcessing(payload, defaultMeetingPurgeDependencies);
    });
    await reconcileMeetingPurgeJobs();
    meetingPurgeRecoveryTimer = setInterval(() => {
      void reconcileMeetingPurgeJobs();
    }, 60_000);
    meetingPurgeRecoveryTimer.unref();
  }
  if (isMeetingIntelligenceQueueConfigured()) {
    meetingIntelligenceWorker = createMeetingIntelligenceWorker(async (payload, context) => {
      const { defaultMeetingIntelligenceDependencies } =
        await import("./meeting-intelligence/default-dependencies");
      const { runMeetingIntelligenceProcessing } = await import("./meeting-intelligence/processor");
      await runMeetingIntelligenceProcessing(
        payload,
        context,
        defaultMeetingIntelligenceDependencies,
      );
    });
    await reconcileMeetingIntelligenceJobs();
    meetingIntelligenceRecoveryTimer = setInterval(() => {
      void reconcileMeetingIntelligenceJobs();
    }, 60_000);
    meetingIntelligenceRecoveryTimer.unref();
  }
  if (
    isMeetingTranscriptionQueueConfigured() &&
    listMeetingTranscriptionProviderCandidates().length > 0
  ) {
    const { reapStaleMeetingTranscriptionDirectories, validateMeetingTranscriptionRuntime } =
      await import("./meeting-transcription/processor");
    await reapStaleMeetingTranscriptionDirectories();
    await validateMeetingTranscriptionRuntime();
    meetingTranscriptionWorker = createMeetingTranscriptionWorker(async (payload, context) => {
      const { defaultMeetingTranscriptionDependencies } =
        await import("./meeting-transcription/default-dependencies");
      const { runMeetingTranscriptionProcessing } =
        await import("./meeting-transcription/processor");
      await runMeetingTranscriptionProcessing(
        payload,
        context,
        defaultMeetingTranscriptionDependencies,
      );
    });
    await reconcileMeetingTranscriptionJobs();
    meetingTranscriptionRecoveryTimer = setInterval(() => {
      void reconcileMeetingTranscriptionJobs();
    }, 60_000);
    meetingTranscriptionRecoveryTimer.unref();
  }
  if (isResumeParseQueueConfigured()) {
    await recoverIncompleteResumeParseJobs();
    worker = createResumeParseWorker(async ({ bypassCache, itemId }) => {
      const { runBulkResumeUploadWorkflow } =
        await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/bulk-resume-upload-workflow");
      await runBulkResumeUploadWorkflow({ bypassCache, itemId });
    });
    if (isResumeSemanticIndexEnabled()) {
      await recoverIncompleteResumeSemanticIndexJobs();
      semanticIndexWorker = createResumeSemanticIndexWorker(async (payload) => {
        if (payload.sourceType === "job_description") {
          const { runJdSemanticIndexJob } =
            await import("@arc/ai-recruitment-copilot-backend/lib/server/jd-semantic/indexer");
          await runJdSemanticIndexJob({
            organizationId: payload.organizationId,
            sourceId: payload.sourceId,
            sourceType: "job_description",
          });
          return;
        }
        const { runResumeSemanticEnrichmentJob } =
          await import("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enrichment");
        await runResumeSemanticEnrichmentJob(payload);
      });
    }
    reviewGenerationWorker = createResumeReviewGenerationWorker(async (payload) => {
      const { processResumeReviewGenerationJob } =
        await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker");
      await processResumeReviewGenerationJob(payload);
    });
    mailIngestScheduler = startMailIngestScheduler();
  }
  if (!worker) {
    console.warn("[worker] REDIS_URL is not set; resume parse worker is not started.");
    mailIngestScheduler = startMailIngestScheduler();
  }

  console.info(`[worker] listening on http://${hostname}:${port}`);
  console.info("[worker] connection config", getWorkerConnectionSummary());
  console.info("[worker] resume parse config", getResumeParseConfigSummary());

  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      try {
        console.info(`[worker] shutting down after ${signal}`);
        mailIngestScheduler?.close();
        await closeServer();
        await worker?.close();
        await semanticIndexWorker?.close();
        await reviewGenerationWorker?.close();
        if (meetingPlaybackRecoveryTimer) {
          clearInterval(meetingPlaybackRecoveryTimer);
        }
        if (meetingPurgeRecoveryTimer) {
          clearInterval(meetingPurgeRecoveryTimer);
        }
        if (meetingAnswerRecoveryTimer) {
          clearInterval(meetingAnswerRecoveryTimer);
        }
        if (meetingIntelligenceRecoveryTimer) {
          clearInterval(meetingIntelligenceRecoveryTimer);
        }
        if (meetingTranscriptionRecoveryTimer) {
          clearInterval(meetingTranscriptionRecoveryTimer);
        }
        await meetingPlaybackWorker?.close();
        await meetingPurgeWorker?.close();
        await meetingAnswerWorker?.close();
        await meetingIntelligenceWorker?.close();
        await meetingTranscriptionWorker?.close();
        await closeMeetingPlaybackQueue();
        await closeMeetingPurgeQueue();
        await closeMeetingAnswerQueue();
        await closeMeetingIntelligenceQueue();
        await closeMeetingTranscriptionQueue();
        await closeResumeParseQueue();
        await closeResumeSemanticIndexQueue();
        await closeResumeReviewGenerationQueue();
        if (process.env.DATABASE_URL) {
          const { closeDatabase } =
            await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
          await closeDatabase();
        }
        process.exit(0);
      } catch (error) {
        console.error(`[worker] failed to shut down after ${signal}`, {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
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
  console.error("[worker] fatal startup failure", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  process.exit(1);
}
