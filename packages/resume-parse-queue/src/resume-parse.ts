import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const RESUME_PARSE_QUEUE_NAME = "resume-parse";
export const RESUME_PARSE_JOB_NAME = "parse-resume-upload-item";

export const resumeParseJobSchema = z.object({
  batchId: z.string().min(1),
  itemId: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export type ResumeParseJobData = z.infer<typeof resumeParseJobSchema>;
export type ResumeParseJobProcessor = (payload: ResumeParseJobData) => Promise<void>;

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_CONCURRENCY = 3;

let queue: Queue<ResumeParseJobData> | null = null;

function redisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.REDIS_URL?.trim();
  return value || null;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRedisConnectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    db: parsed.pathname ? Number.parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    host: parsed.hostname,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
  };
}

function createRedisConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const url = redisUrl(env);
  if (!url) {
    throw new Error("REDIS_URL is not set.");
  }
  return createRedisConnectionFromUrl(url);
}

export function isResumeParseQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisUrl(env));
}

export function getResumeParseQueue(): Queue<ResumeParseJobData> {
  if (!queue) {
    queue = new Queue<ResumeParseJobData>(RESUME_PARSE_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return queue;
}

export function defaultResumeParseJobOptions(env: NodeJS.ProcessEnv = process.env): JobsOptions {
  return {
    attempts: parsePositiveInteger(env.RESUME_PARSE_QUEUE_ATTEMPTS, DEFAULT_ATTEMPTS),
    backoff: {
      delay: parsePositiveInteger(env.RESUME_PARSE_QUEUE_BACKOFF_MS, DEFAULT_BACKOFF_MS),
      type: "exponential",
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function buildResumeParseJobId(itemId: string): string {
  return itemId.replaceAll(":", "-");
}

export async function enqueueResumeParseJobs(jobs: ResumeParseJobData[]): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  const q = getResumeParseQueue();
  const options = defaultResumeParseJobOptions();
  await q.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_PARSE_JOB_NAME,
      opts: {
        ...options,
        jobId: buildResumeParseJobId(data.itemId),
      },
    })),
  );
}

export function getResumeParseQueueStats() {
  const q = getResumeParseQueue();
  return q.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
}

export async function closeResumeParseQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}

export function createResumeParseWorker(
  processJob: ResumeParseJobProcessor,
): Worker<ResumeParseJobData> {
  const worker = new Worker<ResumeParseJobData>(
    RESUME_PARSE_QUEUE_NAME,
    async (job) => {
      const payload = resumeParseJobSchema.parse(job.data);
      await processJob(payload);
    },
    {
      concurrency: parsePositiveInteger(
        process.env.RESUME_PARSE_WORKER_CONCURRENCY,
        DEFAULT_CONCURRENCY,
      ),
      connection: createRedisConnection(),
    },
  );

  worker.on("ready", () => {
    console.info("[resume-parse-worker] ready", {
      concurrency: parsePositiveInteger(
        process.env.RESUME_PARSE_WORKER_CONCURRENCY,
        DEFAULT_CONCURRENCY,
      ),
      queue: RESUME_PARSE_QUEUE_NAME,
    });
  });
  worker.on("active", (job) => {
    console.info("[resume-parse-worker] job active", {
      attemptsMade: job.attemptsMade,
      itemId: job.data.itemId,
      jobId: job.id,
    });
  });
  worker.on("completed", (job) => {
    console.info("[resume-parse-worker] job completed", {
      itemId: job.data.itemId,
      jobId: job.id,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[resume-parse-worker] job failed", {
      error,
      itemId: job?.data.itemId,
      jobId: job?.id,
    });
  });
  worker.on("error", (error) => {
    console.error("[resume-parse-worker] worker error", error);
  });

  return worker;
}
