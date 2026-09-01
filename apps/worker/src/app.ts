import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import {
  getResumeParseQueueStats,
  isResumeParseQueueConfigured,
} from "@arc/resume-parse-queue/resume-parse";
import { getResumeReviewGenerationQueueStats } from "@arc/resume-parse-queue/resume-review-generation";
import { getMeetingIntelligenceQueueStats } from "@arc/meeting-processing-queue/meeting-intelligence";
import { getMeetingPlaybackQueueStats } from "@arc/meeting-processing-queue/meeting-playback";
import { getMeetingTranscriptionQueueStats } from "@arc/meeting-processing-queue/meeting-transcription";
import { getResumeParseReadinessIssue } from "./parse-config";
import { getInterviewNotificationSchedulerSnapshot } from "./interview-notifications/scheduler";
import { captureWorkerException } from "./sentry";

export interface WorkerAppDependencies {
  getInterviewNotificationSchedulerSnapshot: typeof getInterviewNotificationSchedulerSnapshot;
  getMeetingIntelligenceQueueStats: typeof getMeetingIntelligenceQueueStats;
  getMeetingOperationsSnapshot: () => Promise<{
    alerts: unknown[];
    capacity: unknown;
    generatedAt: string;
    latency: unknown;
    providerFailures: unknown[];
    purgeOutcomes: unknown[];
    queueRetries: unknown[];
  }>;
  getMeetingPlaybackQueueStats: typeof getMeetingPlaybackQueueStats;
  getMeetingTranscriptionQueueStats: typeof getMeetingTranscriptionQueueStats;
  getResumeParseQueueStats: typeof getResumeParseQueueStats;
  getResumeParseReadinessIssue: typeof getResumeParseReadinessIssue;
  getResumeReviewGenerationQueueStats: typeof getResumeReviewGenerationQueueStats;
  isResumeParseQueueConfigured: typeof isResumeParseQueueConfigured;
  pingDatabase: () => Promise<void>;
}

// 仅在 readiness 请求到达时加载数据库，避免 HTTP 进程启动阶段提前建立连接。 / Loads the database only for readiness checks, avoiding an eager connection during HTTP startup.
async function pingDatabase(): Promise<void> {
  const { pingDatabase: pingWorkerDatabase } = await import("./db");
  await pingWorkerDatabase();
}

// 仅在受保护的运营端点被调用时加载重量级统计查询。 / Loads the heavier operations query only when its protected endpoint is called.
async function getMeetingOperationsSnapshot() {
  const { loadMeetingOperationsSnapshot } = await import("./meeting-operations/dao");
  return loadMeetingOperationsSnapshot();
}

// 默认映射真实队列与数据库实现，测试可替换该对象而无需启动外部依赖。 / Maps real queue and database implementations while allowing tests to replace external dependencies.
const defaultDependencies: WorkerAppDependencies = {
  getInterviewNotificationSchedulerSnapshot,
  getMeetingIntelligenceQueueStats,
  getMeetingOperationsSnapshot,
  getMeetingPlaybackQueueStats,
  getMeetingTranscriptionQueueStats,
  getResumeParseQueueStats,
  getResumeParseReadinessIssue,
  getResumeReviewGenerationQueueStats,
  isResumeParseQueueConfigured,
  pingDatabase,
};

// 暴露公开存活/就绪检查，并以 Bearer 密钥保护队列和会议运营诊断。 / Exposes public liveness/readiness checks and Bearer-protected queue and meeting diagnostics.
export function createWorkerApp(dependencies: WorkerAppDependencies = defaultDependencies) {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ ok: true }, 200));

  app.get("/readyz", async (c) => {
    if (!dependencies.isResumeParseQueueConfigured()) {
      return c.json({ ok: false, reason: "REDIS_URL is not set" }, 503);
    }
    const parseConfigIssue = dependencies.getResumeParseReadinessIssue();
    if (parseConfigIssue) {
      return c.json({ ok: false, reason: parseConfigIssue }, 503);
    }
    try {
      await dependencies.pingDatabase();
      await dependencies.getResumeParseQueueStats();
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
    const stats = await dependencies.getResumeParseQueueStats();
    return c.json(stats, 200);
  });

  app.get("/queues/resume-review-generation/stats", async (c) => {
    const stats = await dependencies.getResumeReviewGenerationQueueStats();
    return c.json(stats, 200);
  });

  app.get("/operations/meetings", async (c) => {
    const [database, mediaFinalization, finalTranscription, intelligence] = await Promise.all([
      dependencies.getMeetingOperationsSnapshot(),
      dependencies.getMeetingPlaybackQueueStats(),
      dependencies.getMeetingTranscriptionQueueStats(),
      dependencies.getMeetingIntelligenceQueueStats(),
    ]);
    return c.json(
      {
        ...database,
        queues: { finalTranscription, intelligence, mediaFinalization },
      },
      200,
    );
  });

  app.get("/operations/interview-notifications", (c) =>
    c.json(dependencies.getInterviewNotificationSchedulerSnapshot(), 200),
  );

  app.notFound((c) => c.json({ error: "Not Found" }, 404));
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Hono registers its error boundary through this callback API.
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    captureWorkerException(error, "worker.unhandled-request");
    return c.json({ error: "Internal Server Error" }, 500);
  });

  return app;
}
