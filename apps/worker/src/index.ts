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
import { createMailIngestTriggerWorker } from "@arc/resume-parse-queue/mail-ingest-trigger";
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
import { listMeetingTranscriptionProviderCandidates } from "@app/server/worker/meeting-transcription";
import { createWorkerApp } from "./app";
import { isWorkerBackgroundProcessingEnabled, resolveWorkerServerConfig } from "./config";
import { getWorkerConnectionSummary, validateWorkerEnv } from "./env";
import { getResumeParseConfigSummary } from "./parse-config";
import { startMailIngestScheduler } from "./mail-ingest/scheduler";
import type { MailIngestScheduler } from "./mail-ingest/scheduler";
import { startInterviewNotificationScheduler } from "./interview-notifications/scheduler";
import {
  captureWorkerException,
  flushWorkerSentry,
  initializeWorkerSentry,
  reportQueueFailure,
} from "./sentry";

validateWorkerEnv();
initializeWorkerSentry();

// 仅接受 1/true/yes，避免未识别的环境值意外启动语义索引消费。 / Accepts only 1/true/yes so unknown environment values cannot start semantic-index consumption.
function isResumeSemanticIndexEnabled(): boolean {
  const value = process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

// 启动时从数据库恢复未完成批次项，再补入可能因进程退出而丢失的解析队列。 / Restores incomplete batch items from the database at startup and replenishes jobs lost on process exit.
async function recoverIncompleteResumeParseJobs(): Promise<void> {
  const { recoverIncompleteBatchItems } = await import("@app/server/worker/resumes");
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

// 以持久化索引状态为准补发语义索引任务，空结果不会触碰队列。 / Re-enqueues semantic-index work from persisted state and leaves the queue untouched when none is due.
async function recoverIncompleteResumeSemanticIndexJobs(): Promise<void> {
  const { listRecoverableResumeSemanticIndexJobs } = await import("@app/server/worker/resumes");
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

// 从持久化会议状态补发进程中断前未完成的回放混音任务。 / Re-enqueues playback mixing interrupted before completion using persisted meeting state.
async function recoverIncompleteMeetingPlaybackJobs(): Promise<void> {
  const { listRecoverableMeetingPlaybackJobs } = await import("./meeting-playback/dao");
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

// 按数据库中的到期时间补发清理任务，使失败或遗漏的删除最终继续执行。 / Re-enqueues purges due in the database so failed or missed deletion eventually resumes.
async function recoverIncompleteMeetingPurgeJobs(): Promise<void> {
  const { listRecoverableMeetingPurgeJobs } = await import("@app/server/worker/meeting-purge");
  const jobs = await listRecoverableMeetingPurgeJobs();
  if (jobs.length === 0) {
    console.info("[meeting-purge-worker] recovery found no due meetings");
    return;
  }
  await enqueueMeetingPurgeJobs(jobs);
  console.info("[meeting-purge-worker] recovery enqueued meetings", { count: jobs.length });
}

// 补发 pending 或租约已过期的会议问答，避免生成请求永久停留。 / Re-enqueues pending or lease-expired meeting answers so generation requests cannot remain stranded.
async function recoverIncompleteMeetingAnswerJobs(): Promise<void> {
  const { listRecoverableMeetingAnswerJobs } = await import("./meeting-answer/dao");
  const jobs = await listRecoverableMeetingAnswerJobs();
  if (jobs.length === 0) {
    console.info("[meeting-answer-worker] recovery found no pending exchanges");
    return;
  }
  await enqueueMeetingAnswerJobs(jobs);
  console.info("[meeting-answer-worker] recovery enqueued exchanges", { count: jobs.length });
}

// 先补建缺失的自动智能请求，再从持久化运行状态恢复可重试任务。 / Backfills missing automatic-intelligence requests before recovering retryable persisted runs.
async function recoverIncompleteMeetingIntelligenceJobs(): Promise<void> {
  const { listMeetingsNeedingAutomaticIntelligence, listRecoverableMeetingIntelligenceJobs } =
    await import("@app/server/worker/meeting-intelligence");
  const { requestAutomaticMeetingIntelligence } =
    await import("@app/server/worker/meeting-intelligence");
  const missing = await listMeetingsNeedingAutomaticIntelligence();
  for (const meeting of missing) {
    try {
      await requestAutomaticMeetingIntelligence(meeting);
    } catch (error) {
      captureWorkerException(error, "worker.meeting-intelligence.recover-missing");
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

// 从数据库补发待处理或中断的最终转写，恢复队列与会议状态的一致性。 / Re-enqueues pending or interrupted final transcriptions to reconcile queue and meeting state.
async function recoverIncompleteMeetingTranscriptionJobs(): Promise<void> {
  const { listRecoverableMeetingTranscriptionJobs } =
    await import("@app/server/worker/meeting-transcription");
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

// 防止定时器重叠时同一恢复查询并发入队。 / Prevents overlapping timers from enqueueing the same recovery class concurrently.
let meetingPlaybackRecoveryRunning = false;
let meetingPurgeRecoveryRunning = false;
let meetingAnswerRecoveryRunning = false;
let meetingIntelligenceRecoveryRunning = false;
let meetingTranscriptionRecoveryRunning = false;

// 为会议智能恢复增加单飞保护；失败仅记录，留给下一轮继续。 / Adds single-flight protection to intelligence recovery; failures are logged for the next cycle.
async function reconcileMeetingIntelligenceJobs(): Promise<void> {
  if (meetingIntelligenceRecoveryRunning) {
    return;
  }
  meetingIntelligenceRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingIntelligenceJobs();
  } catch (error) {
    captureWorkerException(error, "worker.meeting-intelligence.reconcile");
    console.error("[meeting-intelligence-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingIntelligenceRecoveryRunning = false;
  }
}

// 为会议问答恢复增加单飞保护；失败不会终止 Worker。 / Runs answer recovery single-flight without terminating the Worker on failure.
async function reconcileMeetingAnswerJobs(): Promise<void> {
  if (meetingAnswerRecoveryRunning) {
    return;
  }
  meetingAnswerRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingAnswerJobs();
  } catch (error) {
    captureWorkerException(error, "worker.meeting-answer.reconcile");
    console.error("[meeting-answer-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingAnswerRecoveryRunning = false;
  }
}

// 为回放恢复增加单飞保护；失败留给后续定时轮询重试。 / Runs playback recovery single-flight and defers failures to a later poll.
async function reconcileMeetingPlaybackJobs(): Promise<void> {
  if (meetingPlaybackRecoveryRunning) {
    return;
  }
  meetingPlaybackRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingPlaybackJobs();
  } catch (error) {
    captureWorkerException(error, "worker.meeting-playback.reconcile");
    console.error("[meeting-playback-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingPlaybackRecoveryRunning = false;
  }
}

// 为清理恢复增加单飞保护，避免同一批到期删除被并发补发。 / Runs purge recovery single-flight to avoid concurrently re-enqueueing the same due deletions.
async function reconcileMeetingPurgeJobs(): Promise<void> {
  if (meetingPurgeRecoveryRunning) {
    return;
  }
  meetingPurgeRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingPurgeJobs();
  } catch (error) {
    captureWorkerException(error, "worker.meeting-purge.reconcile");
    console.error("[meeting-purge-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingPurgeRecoveryRunning = false;
  }
}

// 为最终转写恢复增加单飞保护，并将异常隔离到当前轮次。 / Runs final-transcription recovery single-flight and confines errors to the current cycle.
async function reconcileMeetingTranscriptionJobs(): Promise<void> {
  if (meetingTranscriptionRecoveryRunning) {
    return;
  }
  meetingTranscriptionRecoveryRunning = true;
  try {
    await recoverIncompleteMeetingTranscriptionJobs();
  } catch (error) {
    captureWorkerException(error, "worker.meeting-transcription.reconcile");
    console.error("[meeting-transcription-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    meetingTranscriptionRecoveryRunning = false;
  }
}

// 统一组装 HTTP、队列消费者、恢复定时器与优雅关闭流程。 / Composes HTTP, queue consumers, recovery timers, and graceful shutdown in one process boundary.
async function main() {
  const { hostname, port } = resolveWorkerServerConfig();
  const backgroundProcessingEnabled = isWorkerBackgroundProcessingEnabled();
  const app = createWorkerApp();
  const server = serve({
    fetch: app.fetch,
    hostname,
    port,
  });
  // oxlint-disable-next-line promise/no-promise-in-callback, promise/prefer-await-to-callbacks -- Node exposes server failures through EventEmitter; flush before exiting.
  server.on("error", async (error: NodeJS.ErrnoException) => {
    captureWorkerException(error, "worker.http-server");
    if (error.code === "EADDRINUSE") {
      console.error(`[worker] ${hostname}:${port} is already in use.`);
    } else {
      console.error("[worker] server error", { errorName: error.name });
    }
    await flushWorkerSentry();
    process.exit(1);
  });
  const closeServer = promisify(server.close.bind(server));

  let worker: ReturnType<typeof createResumeParseWorker> | null = null;
  // Notification outbox polling has its own feature flags and remains independent
  // from the general background-processing switch used by resume/meeting queues.
  const interviewNotificationScheduler = startInterviewNotificationScheduler({
    claimEvents: async (input) => {
      const { claimInterviewNotificationEvents } =
        await import("./interview-notifications/default-dependencies");
      return claimInterviewNotificationEvents(input);
    },
    processEvent: async (event, leaseOwner) => {
      const [
        { defaultInterviewNotificationProcessorDependencies },
        { processInterviewNotificationEvent },
      ] = await Promise.all([
        import("./interview-notifications/default-dependencies"),
        import("./interview-notifications/processor"),
      ]);
      await processInterviewNotificationEvent(
        event,
        { leaseOwner },
        defaultInterviewNotificationProcessorDependencies,
      );
    },
  });
  let semanticIndexWorker: ReturnType<typeof createResumeSemanticIndexWorker> | null = null;
  let reviewGenerationWorker: ReturnType<typeof createResumeReviewGenerationWorker> | null = null;
  let mailIngestScheduler: MailIngestScheduler | null = null;
  let mailIngestTriggerWorker: ReturnType<typeof createMailIngestTriggerWorker> | null = null;
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
  if (backgroundProcessingEnabled && isMeetingAnswerQueueConfigured()) {
    meetingAnswerWorker = createMeetingAnswerWorker(async (payload, context) => {
      const [{ defaultMeetingAnswerDependencies }, { runMeetingAnswerProcessing }] =
        await Promise.all([
          import("./meeting-answer/default-dependencies"),
          import("./meeting-answer/processor"),
        ]);
      await runMeetingAnswerProcessing(payload, context, defaultMeetingAnswerDependencies);
    });
    meetingAnswerWorker.on("failed", reportQueueFailure("meeting-answer"));
    await reconcileMeetingAnswerJobs();
    meetingAnswerRecoveryTimer = setInterval(() => {
      void reconcileMeetingAnswerJobs();
    }, 60_000);
    meetingAnswerRecoveryTimer.unref();
  }
  if (backgroundProcessingEnabled && isMeetingProcessingQueueConfigured()) {
    meetingPlaybackWorker = createMeetingPlaybackWorker(async (payload) => {
      const { defaultMeetingPlaybackDependencies } =
        await import("./meeting-playback/default-dependencies");
      const { runMeetingPlaybackProcessing } = await import("./meeting-playback/processor");
      await runMeetingPlaybackProcessing(payload, defaultMeetingPlaybackDependencies);
    });
    meetingPlaybackWorker.on("failed", reportQueueFailure("meeting-playback"));
    await reconcileMeetingPlaybackJobs();
    meetingPlaybackRecoveryTimer = setInterval(() => {
      void reconcileMeetingPlaybackJobs();
    }, 60_000);
    meetingPlaybackRecoveryTimer.unref();
  }
  if (backgroundProcessingEnabled && isMeetingPurgeQueueConfigured()) {
    meetingPurgeWorker = createMeetingPurgeWorker(async (payload) => {
      const { defaultMeetingPurgeDependencies } =
        await import("./meeting-purge/default-dependencies");
      const { runMeetingPurgeProcessing } = await import("./meeting-purge/processor");
      await runMeetingPurgeProcessing(payload, defaultMeetingPurgeDependencies);
    });
    meetingPurgeWorker.on("failed", reportQueueFailure("meeting-purge"));
    await reconcileMeetingPurgeJobs();
    meetingPurgeRecoveryTimer = setInterval(() => {
      void reconcileMeetingPurgeJobs();
    }, 60_000);
    meetingPurgeRecoveryTimer.unref();
  }
  if (backgroundProcessingEnabled && isMeetingIntelligenceQueueConfigured()) {
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
    meetingIntelligenceWorker.on("failed", reportQueueFailure("meeting-intelligence"));
    await reconcileMeetingIntelligenceJobs();
    meetingIntelligenceRecoveryTimer = setInterval(() => {
      void reconcileMeetingIntelligenceJobs();
    }, 60_000);
    meetingIntelligenceRecoveryTimer.unref();
  }
  if (
    backgroundProcessingEnabled &&
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
    meetingTranscriptionWorker.on("failed", reportQueueFailure("meeting-transcription"));
    await reconcileMeetingTranscriptionJobs();
    meetingTranscriptionRecoveryTimer = setInterval(() => {
      void reconcileMeetingTranscriptionJobs();
    }, 60_000);
    meetingTranscriptionRecoveryTimer.unref();
  }
  if (backgroundProcessingEnabled && isResumeParseQueueConfigured()) {
    await recoverIncompleteResumeParseJobs();
    worker = createResumeParseWorker(async ({ bypassCache, itemId }, context) => {
      const { runBulkResumeUploadWorkflow } = await import("@app/server/worker/resumes");
      await runBulkResumeUploadWorkflow({
        bypassCache,
        itemId,
        retryParseFailure: context.hasAttemptsRemaining,
      });
    });
    worker.on("failed", reportQueueFailure("resume-parse"));
    if (isResumeSemanticIndexEnabled()) {
      await recoverIncompleteResumeSemanticIndexJobs();
      semanticIndexWorker = createResumeSemanticIndexWorker(async (payload) => {
        if (payload.sourceType === "job_description") {
          const { runJdSemanticIndexJob } = await import("@app/server/worker/resumes");
          await runJdSemanticIndexJob({
            organizationId: payload.organizationId,
            sourceId: payload.sourceId,
            sourceType: "job_description",
          });
          return;
        }
        const { runResumeSemanticEnrichmentJob } = await import("@app/server/worker/resumes");
        await runResumeSemanticEnrichmentJob(payload);
      });
      semanticIndexWorker.on("failed", reportQueueFailure("resume-semantic-index"));
    }
    reviewGenerationWorker = createResumeReviewGenerationWorker(async (payload, context) => {
      const { processResumeReviewGenerationJob } = await import("@app/server/worker/resumes");
      await processResumeReviewGenerationJob(payload, undefined, context);
    });
    reviewGenerationWorker.on("failed", reportQueueFailure("resume-review-generation"));
    mailIngestScheduler = startMailIngestScheduler();
  }
  if (backgroundProcessingEnabled && !worker) {
    console.warn("[worker] REDIS_URL is not set; resume parse worker is not started.");
    mailIngestScheduler = startMailIngestScheduler();
  }
  if (mailIngestScheduler) {
    mailIngestTriggerWorker = createMailIngestTriggerWorker(async ({ organizationId }) => {
      await mailIngestScheduler?.runNow({ organizationId });
    });
    mailIngestTriggerWorker.on("failed", reportQueueFailure("mail-ingest-trigger"));
  }
  if (!backgroundProcessingEnabled) {
    console.info("[worker] general background processing disabled");
  }

  console.info(`[worker] listening on http://${hostname}:${port}`);
  console.info("[worker] connection config", getWorkerConnectionSummary());
  console.info("[worker] resume parse config", getResumeParseConfigSummary());

  const shutdown = (signal: NodeJS.Signals) => {
    void (async () => {
      try {
        console.info(`[worker] shutting down after ${signal}`);
        mailIngestScheduler?.close();
        await mailIngestTriggerWorker?.close();
        interviewNotificationScheduler?.close();
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
          const { closeDatabase } = await import("./db");
          await closeDatabase();
        }
        process.exit(0);
      } catch (error) {
        captureWorkerException(error, "worker.shutdown", { signal });
        console.error(`[worker] failed to shut down after ${signal}`, {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        await flushWorkerSentry();
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
  captureWorkerException(error, "worker.startup");
  console.error("[worker] fatal startup failure", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  await flushWorkerSentry();
  process.exit(1);
}
