import { promisify } from "node:util";
import { serve } from "@hono/node-server";
import {
  closeResumeParseQueue,
  createResumeParseWorker,
  isResumeParseQueueConfigured,
} from "@app/resume-parse-queue/resume-parse";
import {
  closeResumeSemanticIndexQueue,
  createResumeSemanticIndexWorker,
  enqueueResumeSemanticIndexJobs,
} from "@app/resume-parse-queue/resume-semantic-index";
import {
  closeResumeReviewGenerationQueue,
  createResumeReviewGenerationWorker,
} from "@app/resume-parse-queue/resume-review-generation";
import { createMailIngestTriggerWorker } from "@app/resume-parse-queue/mail-ingest-trigger";
import {
  closeMeetingAnswerQueue,
  createMeetingAnswerWorker,
  enqueueMeetingAnswerJobs,
  isMeetingAnswerQueueConfigured,
} from "@app/meeting-processing-queue/meeting-answer";
import {
  closeMeetingIntelligenceQueue,
  createMeetingIntelligenceWorker,
  enqueueMeetingIntelligenceJobs,
  isMeetingIntelligenceQueueConfigured,
} from "@app/meeting-processing-queue/meeting-intelligence";
import {
  closeMeetingPlaybackQueue,
  createMeetingPlaybackWorker,
  enqueueMeetingPlaybackJobs,
  isMeetingProcessingQueueConfigured,
} from "@app/meeting-processing-queue/meeting-playback";
import {
  closeMeetingPurgeQueue,
  createMeetingPurgeWorker,
  enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured,
} from "@app/meeting-processing-queue/meeting-purge";
import {
  closeMeetingTranscriptionQueue,
  createMeetingTranscriptionWorker,
  enqueueMeetingTranscriptionJobs,
  isMeetingTranscriptionQueueConfigured,
} from "@app/meeting-processing-queue/meeting-transcription";
import {
  closeHumanInterviewRecordingQueue,
  createHumanInterviewRecordingWorker,
  enqueueHumanInterviewRecordingJobs,
  isHumanInterviewRecordingQueueConfigured,
} from "@app/meeting-processing-queue/human-interview-recording";
import {
  closeHumanInterviewEvaluationQueue,
  createHumanInterviewEvaluationWorker,
  enqueueHumanInterviewEvaluationJobs,
  isHumanInterviewEvaluationQueueConfigured,
} from "@app/meeting-processing-queue/human-interview-evaluation";
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
import { createWorkerLifecycle } from "./effect/lifecycle";
import { Exit } from "effect";

validateWorkerEnv();
initializeWorkerSentry();

const reportFinalizerFailure = (failure: { cause: unknown; resource: string }) => {
  captureWorkerException(failure.cause, "worker.finalizer", { resource: failure.resource });
  console.error("[worker] resource cleanup failed", {
    errorName: failure.cause instanceof Error ? failure.cause.name : "UnknownError",
    resource: failure.resource,
  });
};
const triggerLifecycle = createWorkerLifecycle(reportFinalizerFailure);
const resourceLifecycle = createWorkerLifecycle(reportFinalizerFailure);
const activeRecoveryRuns = new Set<Promise<void>>();

function trackRecoveryRun(run: () => Promise<void>): Promise<void> {
  const active = run();
  activeRecoveryRuns.add(active);
  // oxlint-disable-next-line promise/prefer-await-to-then -- finalization removes this exact in-flight Promise from the drain set.
  void active.finally(() => activeRecoveryRuns.delete(active));
  return active;
}

async function closeWorkerLifecycles(exit: Exit.Exit<unknown, unknown> = Exit.void): Promise<void> {
  // Stop HTTP, timers, and schedulers before draining BullMQ workers and closing queues.
  let cleanupError: unknown;
  let hasCleanupError = false;
  try {
    await triggerLifecycle.close(exit);
  } catch (error) {
    cleanupError = error;
    hasCleanupError = true;
  }
  try {
    await resourceLifecycle.close(exit);
  } catch (error) {
    if (!hasCleanupError) {
      cleanupError = error;
      hasCleanupError = true;
    }
  }
  if (hasCleanupError) {
    throw cleanupError;
  }
}

// 仅接受 1/true/yes，避免未识别的环境值意外启动语义索引消费。 / Accepts only 1/true/yes so unknown environment values cannot start semantic-index consumption.
function isResumeSemanticIndexEnabled(): boolean {
  const value = process.env.RESUME_SEMANTIC_INDEX_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

// 启动时从数据库恢复未完成批次项，再补入可能因进程退出而丢失的解析队列。 / Restores incomplete batch items from the database at startup and replenishes jobs lost on process exit.
async function recoverIncompleteResumeParseJobs(): Promise<void> {
  const { recoverIncompleteBatchItems } = await import("./resume-processing/ingest");
  const { enqueueResumeParseJobs } = await import("@app/resume-parse-queue/resume-parse");
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
  const { listRecoverableResumeSemanticIndexJobs } = await import("./resume-processing/semantic");
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
  const { meetingPurgeDao } = await import("./meeting-processing-daos");
  const jobs = await meetingPurgeDao.listRecoverableMeetingPurgeJobs();
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
  const { meetingIntelligenceDao, requestAutomaticMeetingIntelligence } =
    await import("./meeting-processing-daos");
  const missing = await meetingIntelligenceDao.listMeetingsNeedingAutomaticIntelligence();
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
  const jobs = await meetingIntelligenceDao.listRecoverableMeetingIntelligenceJobs();
  if (jobs.length === 0) {
    console.info("[meeting-intelligence-worker] recovery found no pending runs");
    return;
  }
  await enqueueMeetingIntelligenceJobs(jobs);
  console.info("[meeting-intelligence-worker] recovery enqueued runs", { count: jobs.length });
}

// 从数据库补发待处理或中断的最终转写，恢复队列与会议状态的一致性。 / Re-enqueues pending or interrupted final transcriptions to reconcile queue and meeting state.
async function recoverIncompleteMeetingTranscriptionJobs(): Promise<void> {
  const { meetingTranscriptionDao } = await import("./meeting-processing-daos");
  const jobs = await meetingTranscriptionDao.listRecoverableMeetingTranscriptionJobs();
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
async function recoverIncompleteHumanInterviewRecordingJobs(): Promise<void> {
  const { humanInterviewRecordingDao } = await import("./meeting-processing-daos");
  const jobs = await humanInterviewRecordingDao.listRecoverableHumanInterviewRecordingJobs();
  if (jobs.length === 0) {
    console.info("[human-interview-recording-worker] recovery found no pending recordings");
    return;
  }
  await enqueueHumanInterviewRecordingJobs(jobs);
  console.info("[human-interview-recording-worker] recovery enqueued recordings", {
    count: jobs.length,
  });
}

async function recoverIncompleteHumanInterviewEvaluationJobs(): Promise<void> {
  const { humanInterviewEvaluationDao } = await import("./meeting-processing-daos");
  const jobs = await humanInterviewEvaluationDao.listRecoverableHumanInterviewEvaluationJobs();
  if (jobs.length === 0) {
    console.info("[human-interview-evaluation-worker] recovery found no pending evaluations");
    return;
  }
  await enqueueHumanInterviewEvaluationJobs(jobs);
  console.info("[human-interview-evaluation-worker] recovery enqueued evaluations", {
    count: jobs.length,
  });
}

let meetingPlaybackRecoveryRunning = false;
let meetingPurgeRecoveryRunning = false;
let meetingAnswerRecoveryRunning = false;
let meetingIntelligenceRecoveryRunning = false;
let meetingTranscriptionRecoveryRunning = false;
let humanInterviewRecordingRecoveryRunning = false;
let humanInterviewEvaluationRecoveryRunning = false;

async function reconcileHumanInterviewEvaluationJobs(): Promise<void> {
  if (humanInterviewEvaluationRecoveryRunning) {
    return;
  }
  humanInterviewEvaluationRecoveryRunning = true;
  try {
    await recoverIncompleteHumanInterviewEvaluationJobs();
  } catch (error) {
    captureWorkerException(error, "worker.human-interview-evaluation.reconcile");
    console.error("[human-interview-evaluation-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    humanInterviewEvaluationRecoveryRunning = false;
  }
}

async function reconcileHumanInterviewRecordingJobs(): Promise<void> {
  if (humanInterviewRecordingRecoveryRunning) {
    return;
  }
  humanInterviewRecordingRecoveryRunning = true;
  try {
    await recoverIncompleteHumanInterviewRecordingJobs();
  } catch (error) {
    captureWorkerException(error, "worker.human-interview-recording.reconcile");
    console.error("[human-interview-recording-worker] periodic recovery failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  } finally {
    humanInterviewRecordingRecoveryRunning = false;
  }
}

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
// oxlint-disable-next-line complexity -- worker bootstrap coordinates independently configurable queues and recovery timers.
async function main() {
  resourceLifecycle.addFinalizer("database", async () => {
    if (process.env.DATABASE_URL) {
      const { closeDatabase } = await import("./db");
      await closeDatabase();
    }
  });
  resourceLifecycle.addFinalizer(
    "resume-review-generation-queue",
    closeResumeReviewGenerationQueue,
  );
  resourceLifecycle.addFinalizer("resume-semantic-index-queue", closeResumeSemanticIndexQueue);
  resourceLifecycle.addFinalizer("resume-parse-queue", closeResumeParseQueue);
  resourceLifecycle.addFinalizer(
    "human-interview-evaluation-queue",
    closeHumanInterviewEvaluationQueue,
  );
  resourceLifecycle.addFinalizer(
    "human-interview-recording-queue",
    closeHumanInterviewRecordingQueue,
  );
  resourceLifecycle.addFinalizer("meeting-transcription-queue", closeMeetingTranscriptionQueue);
  resourceLifecycle.addFinalizer("meeting-intelligence-queue", closeMeetingIntelligenceQueue);
  resourceLifecycle.addFinalizer("meeting-answer-queue", closeMeetingAnswerQueue);
  resourceLifecycle.addFinalizer("meeting-purge-queue", closeMeetingPurgeQueue);
  resourceLifecycle.addFinalizer("meeting-playback-queue", closeMeetingPlaybackQueue);
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
    await closeWorkerLifecycles(Exit.fail(error));
    await flushWorkerSentry();
    process.exit(1);
  });
  const closeServer = promisify(server.close.bind(server));
  let serverClosePromise: Promise<void> | undefined;
  const closeHttpServer = () => {
    serverClosePromise ??= closeServer();
    return serverClosePromise;
  };
  triggerLifecycle.addFinalizer("http-server-fallback", closeHttpServer);
  triggerLifecycle.addFinalizer("recovery-drain", async () => {
    await Promise.allSettled(activeRecoveryRuns);
  });

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
  if (interviewNotificationScheduler) {
    triggerLifecycle.addFinalizer("interview-notification-scheduler", () =>
      interviewNotificationScheduler.close(),
    );
  }
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
  let humanInterviewRecordingWorker: ReturnType<typeof createHumanInterviewRecordingWorker> | null =
    null;
  let humanInterviewRecordingRecoveryTimer: NodeJS.Timeout | null = null;
  let humanInterviewEvaluationWorker: ReturnType<
    typeof createHumanInterviewEvaluationWorker
  > | null = null;
  let humanInterviewEvaluationRecoveryTimer: NodeJS.Timeout | null = null;
  if (backgroundProcessingEnabled && isHumanInterviewEvaluationQueueConfigured()) {
    humanInterviewEvaluationWorker = createHumanInterviewEvaluationWorker(
      async (payload, context) => {
        const { defaultHumanInterviewEvaluationDependencies } =
          await import("./human-interview-evaluation/default-dependencies");
        const { runHumanInterviewEvaluationProcessing } =
          await import("./human-interview-evaluation/processor");
        await runHumanInterviewEvaluationProcessing(
          payload,
          context,
          defaultHumanInterviewEvaluationDependencies,
        );
      },
    );
    humanInterviewEvaluationWorker.on("failed", reportQueueFailure("human-interview-evaluation"));
    resourceLifecycle.addFinalizer("human-interview-evaluation-worker", () =>
      humanInterviewEvaluationWorker?.close(),
    );
    await reconcileHumanInterviewEvaluationJobs();
    humanInterviewEvaluationRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileHumanInterviewEvaluationJobs);
    }, 60_000);
    humanInterviewEvaluationRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("human-interview-evaluation-recovery", () => {
      if (humanInterviewEvaluationRecoveryTimer) {
        clearInterval(humanInterviewEvaluationRecoveryTimer);
      }
    });
  }
  if (backgroundProcessingEnabled && isHumanInterviewRecordingQueueConfigured()) {
    humanInterviewRecordingWorker = createHumanInterviewRecordingWorker(
      async (payload, context) => {
        const { defaultHumanInterviewRecordingDependencies } =
          await import("./human-interview-recording/default-dependencies");
        const { runHumanInterviewRecordingProcessing } =
          await import("./human-interview-recording/processor");
        await runHumanInterviewRecordingProcessing(
          payload,
          context,
          defaultHumanInterviewRecordingDependencies,
        );
      },
    );
    humanInterviewRecordingWorker.on("failed", reportQueueFailure("human-interview-recording"));
    resourceLifecycle.addFinalizer("human-interview-recording-worker", () =>
      humanInterviewRecordingWorker?.close(),
    );
    await reconcileHumanInterviewRecordingJobs();
    humanInterviewRecordingRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileHumanInterviewRecordingJobs);
    }, 60_000);
    humanInterviewRecordingRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("human-interview-recording-recovery", () => {
      if (humanInterviewRecordingRecoveryTimer) {
        clearInterval(humanInterviewRecordingRecoveryTimer);
      }
    });
  }
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
    resourceLifecycle.addFinalizer("meeting-answer-worker", () => meetingAnswerWorker?.close());
    await reconcileMeetingAnswerJobs();
    meetingAnswerRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileMeetingAnswerJobs);
    }, 60_000);
    meetingAnswerRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("meeting-answer-recovery", () => {
      if (meetingAnswerRecoveryTimer) {
        clearInterval(meetingAnswerRecoveryTimer);
      }
    });
  }
  if (backgroundProcessingEnabled && isMeetingProcessingQueueConfigured()) {
    meetingPlaybackWorker = createMeetingPlaybackWorker(async (payload) => {
      const { defaultMeetingPlaybackDependencies } =
        await import("./meeting-playback/default-dependencies");
      const { runMeetingPlaybackProcessing } = await import("./meeting-playback/processor");
      await runMeetingPlaybackProcessing(payload, defaultMeetingPlaybackDependencies);
    });
    meetingPlaybackWorker.on("failed", reportQueueFailure("meeting-playback"));
    resourceLifecycle.addFinalizer("meeting-playback-worker", () => meetingPlaybackWorker?.close());
    await reconcileMeetingPlaybackJobs();
    meetingPlaybackRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileMeetingPlaybackJobs);
    }, 60_000);
    meetingPlaybackRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("meeting-playback-recovery", () => {
      if (meetingPlaybackRecoveryTimer) {
        clearInterval(meetingPlaybackRecoveryTimer);
      }
    });
  }
  if (backgroundProcessingEnabled && isMeetingPurgeQueueConfigured()) {
    meetingPurgeWorker = createMeetingPurgeWorker(async (payload) => {
      const { defaultMeetingPurgeDependencies } =
        await import("./meeting-purge/default-dependencies");
      const { runMeetingPurgeProcessing } = await import("./meeting-purge/processor");
      await runMeetingPurgeProcessing(payload, defaultMeetingPurgeDependencies);
    });
    meetingPurgeWorker.on("failed", reportQueueFailure("meeting-purge"));
    resourceLifecycle.addFinalizer("meeting-purge-worker", () => meetingPurgeWorker?.close());
    await reconcileMeetingPurgeJobs();
    meetingPurgeRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileMeetingPurgeJobs);
    }, 60_000);
    meetingPurgeRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("meeting-purge-recovery", () => {
      if (meetingPurgeRecoveryTimer) {
        clearInterval(meetingPurgeRecoveryTimer);
      }
    });
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
    resourceLifecycle.addFinalizer("meeting-intelligence-worker", () =>
      meetingIntelligenceWorker?.close(),
    );
    await reconcileMeetingIntelligenceJobs();
    meetingIntelligenceRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileMeetingIntelligenceJobs);
    }, 60_000);
    meetingIntelligenceRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("meeting-intelligence-recovery", () => {
      if (meetingIntelligenceRecoveryTimer) {
        clearInterval(meetingIntelligenceRecoveryTimer);
      }
    });
  }
  if (backgroundProcessingEnabled && isMeetingTranscriptionQueueConfigured()) {
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
    resourceLifecycle.addFinalizer("meeting-transcription-worker", () =>
      meetingTranscriptionWorker?.close(),
    );
    await reconcileMeetingTranscriptionJobs();
    meetingTranscriptionRecoveryTimer = setInterval(() => {
      void trackRecoveryRun(reconcileMeetingTranscriptionJobs);
    }, 60_000);
    meetingTranscriptionRecoveryTimer.unref();
    triggerLifecycle.addFinalizer("meeting-transcription-recovery", () => {
      if (meetingTranscriptionRecoveryTimer) {
        clearInterval(meetingTranscriptionRecoveryTimer);
      }
    });
  }
  if (backgroundProcessingEnabled && isResumeParseQueueConfigured()) {
    await recoverIncompleteResumeParseJobs();
    worker = createResumeParseWorker(async ({ bypassCache, itemId }, context) => {
      const { runBulkResumeUploadWorkflow } = await import("./resume-processing/ingest");
      await runBulkResumeUploadWorkflow({
        bypassCache,
        itemId,
        retryParseFailure: context.hasAttemptsRemaining,
      });
    });
    worker.on("failed", reportQueueFailure("resume-parse"));
    resourceLifecycle.addFinalizer("resume-parse-worker", () => worker?.close());
    if (isResumeSemanticIndexEnabled()) {
      await recoverIncompleteResumeSemanticIndexJobs();
      semanticIndexWorker = createResumeSemanticIndexWorker(async (payload) => {
        if (payload.sourceType === "job_description") {
          const { runJdSemanticIndexJob } = await import("./resume-processing/semantic");
          await runJdSemanticIndexJob({
            organizationId: payload.organizationId,
            sourceId: payload.sourceId,
            sourceType: "job_description",
          });
          return;
        }
        const { runResumeSemanticEnrichmentJob } = await import("./resume-processing/semantic");
        await runResumeSemanticEnrichmentJob(payload);
      });
      semanticIndexWorker.on("failed", reportQueueFailure("resume-semantic-index"));
      resourceLifecycle.addFinalizer("resume-semantic-index-worker", () =>
        semanticIndexWorker?.close(),
      );
    }
    reviewGenerationWorker = createResumeReviewGenerationWorker(async (payload, context) => {
      const { processResumeReviewGenerationJob } = await import("./resume-processing/review");
      await processResumeReviewGenerationJob(payload, undefined, context);
    });
    reviewGenerationWorker.on("failed", reportQueueFailure("resume-review-generation"));
    resourceLifecycle.addFinalizer("resume-review-generation-worker", () =>
      reviewGenerationWorker?.close(),
    );
    mailIngestScheduler = startMailIngestScheduler();
    if (mailIngestScheduler) {
      triggerLifecycle.addFinalizer("mail-ingest-scheduler", () => mailIngestScheduler?.close());
    }
  }
  if (backgroundProcessingEnabled && !worker) {
    console.warn("[worker] REDIS_URL is not set; resume parse worker is not started.");
    mailIngestScheduler = startMailIngestScheduler();
    if (mailIngestScheduler) {
      triggerLifecycle.addFinalizer("mail-ingest-scheduler", () => mailIngestScheduler?.close());
    }
  }
  if (mailIngestScheduler) {
    mailIngestTriggerWorker = createMailIngestTriggerWorker(async ({ organizationId }) => {
      await mailIngestScheduler?.runNow({ organizationId });
    });
    mailIngestTriggerWorker.on("failed", reportQueueFailure("mail-ingest-trigger"));
    resourceLifecycle.addFinalizer("mail-ingest-trigger-worker", () =>
      mailIngestTriggerWorker?.close(),
    );
  }
  if (!backgroundProcessingEnabled) {
    console.info("[worker] general background processing disabled");
  }

  // Registered last so normal shutdown stops new HTTP work before draining background resources.
  triggerLifecycle.addFinalizer("http-server", closeHttpServer);

  console.info(`[worker] listening on http://${hostname}:${port}`);
  console.info("[worker] connection config", getWorkerConnectionSummary());
  console.info("[worker] resume parse config", getResumeParseConfigSummary());

  const shutdown = (signal: NodeJS.Signals) => {
    // oxlint-disable-next-line complexity -- shutdown mirrors every optional worker and timer initialized above.
    void (async () => {
      try {
        console.info(`[worker] shutting down after ${signal}`);
        await closeWorkerLifecycles();
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
  await closeWorkerLifecycles(Exit.fail(error));
  await flushWorkerSentry();
  process.exit(1);
}
