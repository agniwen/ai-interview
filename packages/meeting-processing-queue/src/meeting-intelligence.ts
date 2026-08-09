import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const MEETING_INTELLIGENCE_QUEUE_NAME = "meeting-intelligence";
export const MEETING_INTELLIGENCE_JOB_NAME = "generate-meeting-intelligence";
export const MEETING_INTELLIGENCE_PIPELINE_VERSION = "intelligence-v1";
export const MEETING_INTELLIGENCE_PROMPT_VERSION = "meeting-intelligence-v1";

export const meetingIntelligenceJobSchema = z.object({
  processingRunId: z.string().min(1),
});

export type MeetingIntelligenceJobData = z.infer<typeof meetingIntelligenceJobSchema>;
export type MeetingIntelligenceJobProcessor = (
  payload: MeetingIntelligenceJobData,
  context: { attempt: number; maxAttempts: number },
) => Promise<void>;

interface MeetingIntelligenceQueuePort {
  add: (name: string, data: MeetingIntelligenceJobData, options: JobsOptions) => Promise<unknown>;
  getJob: (
    jobId: string,
  ) => Promise<{ getState: () => Promise<string>; remove: () => Promise<void> } | undefined>;
}

let queue: Queue<MeetingIntelligenceJobData> | null = null;

function redisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.REDIS_URL?.trim() || null;
}

function createRedisConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const value = redisUrl(env);
  if (!value) {
    throw new Error("REDIS_URL is not set.");
  }
  const parsed = new URL(value);
  return {
    db: parsed.pathname ? Number.parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    host: parsed.hostname,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
  };
}

function databaseQueueScope(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) {
    return "no-database-url";
  }
  try {
    const parsed = new URL(value);
    return [
      parsed.protocol.toLowerCase(),
      parsed.username,
      parsed.hostname.toLowerCase(),
      parsed.port || "5432",
      parsed.pathname,
    ].join("|");
  } catch {
    return value;
  }
}

export function buildMeetingIntelligenceQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MEETING_INTELLIGENCE_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseQueueScope(env)).digest("hex").slice(0, 12);
  return `arc:meeting-intelligence:${hash}`;
}

export function buildMeetingIntelligenceJobId(data: MeetingIntelligenceJobData): string {
  return `meeting-intelligence-${data.processingRunId.replaceAll(":", "-")}`;
}

export function resolveMeetingIntelligenceWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number.parseInt(env.MEETING_INTELLIGENCE_CONCURRENCY || "4", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

export function isMeetingIntelligenceQueueConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(redisUrl(env));
}

function jobOptions(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 10_000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function getMeetingIntelligenceQueue(): Queue<MeetingIntelligenceJobData> {
  queue ??= new Queue<MeetingIntelligenceJobData>(MEETING_INTELLIGENCE_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: buildMeetingIntelligenceQueuePrefix(),
  });
  return queue;
}

export async function reconcileMeetingIntelligenceJob(
  currentQueue: MeetingIntelligenceQueuePort,
  data: MeetingIntelligenceJobData,
): Promise<void> {
  const jobId = buildMeetingIntelligenceJobId(data);
  const existing = await currentQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "completed" && state !== "failed") {
      return;
    }
    await existing.remove();
  }
  await currentQueue.add(MEETING_INTELLIGENCE_JOB_NAME, data, { ...jobOptions(), jobId });
}

export async function enqueueMeetingIntelligenceJobs(
  jobs: MeetingIntelligenceJobData[],
): Promise<void> {
  if (jobs.length === 0 || !redisUrl()) {
    return;
  }
  const currentQueue = getMeetingIntelligenceQueue();
  await Promise.all(jobs.map((job) => reconcileMeetingIntelligenceJob(currentQueue, job)));
}

export function createMeetingIntelligenceWorker(
  processJob: MeetingIntelligenceJobProcessor,
): Worker<MeetingIntelligenceJobData> {
  const concurrency = resolveMeetingIntelligenceWorkerConcurrency();
  const worker = new Worker<MeetingIntelligenceJobData>(
    MEETING_INTELLIGENCE_QUEUE_NAME,
    async (job) => {
      await processJob(meetingIntelligenceJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: typeof job.opts.attempts === "number" ? job.opts.attempts : 1,
      });
    },
    {
      concurrency,
      connection: createRedisConnection(),
      prefix: buildMeetingIntelligenceQueuePrefix(),
    },
  );
  worker.on("ready", () => {
    console.info("[meeting-intelligence-worker] ready", {
      concurrency,
      queue: MEETING_INTELLIGENCE_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[meeting-intelligence-worker] job failed", {
      error,
      jobId: job?.id,
      processingRunId: job?.data.processingRunId,
    });
  });
  return worker;
}

export async function closeMeetingIntelligenceQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
