import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const MEETING_ANSWER_QUEUE_NAME = "meeting-answer";
export const MEETING_ANSWER_JOB_NAME = "generate-meeting-answer";
export const MEETING_ANSWER_PROMPT_VERSION = "meeting-answer-v1";

export const meetingAnswerJobSchema = z.object({ exchangeId: z.string().min(1) });
export type MeetingAnswerJobData = z.infer<typeof meetingAnswerJobSchema>;
export type MeetingAnswerJobProcessor = (
  payload: MeetingAnswerJobData,
  context: { attempt: number; maxAttempts: number },
) => Promise<void>;

interface MeetingAnswerQueuePort {
  add: (name: string, data: MeetingAnswerJobData, options: JobsOptions) => Promise<unknown>;
  getJob: (
    jobId: string,
  ) => Promise<{ getState: () => Promise<string>; remove: () => Promise<void> } | undefined>;
}

let queue: Queue<MeetingAnswerJobData> | null = null;

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

function databaseScope(env: NodeJS.ProcessEnv): string {
  const value = env.DATABASE_URL?.trim() || "no-database-url";
  try {
    const parsed = new URL(value);
    return [
      parsed.protocol,
      parsed.username,
      parsed.hostname,
      parsed.port || "5432",
      parsed.pathname,
    ].join("|");
  } catch {
    return value;
  }
}

export function buildMeetingAnswerQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MEETING_ANSWER_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseScope(env)).digest("hex").slice(0, 12);
  return `arc:meeting-answer:${hash}`;
}

export function buildMeetingAnswerJobId(data: MeetingAnswerJobData): string {
  return `meeting-answer-${data.exchangeId.replaceAll(":", "-")}`;
}

export function isMeetingAnswerQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisUrl(env));
}

function jobOptions(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 5000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function getMeetingAnswerQueue(): Queue<MeetingAnswerJobData> {
  queue ??= new Queue<MeetingAnswerJobData>(MEETING_ANSWER_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: buildMeetingAnswerQueuePrefix(),
  });
  return queue;
}

export async function reconcileMeetingAnswerJob(
  currentQueue: MeetingAnswerQueuePort,
  data: MeetingAnswerJobData,
): Promise<void> {
  const jobId = buildMeetingAnswerJobId(data);
  const existing = await currentQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "completed" && state !== "failed") {
      return;
    }
    await existing.remove();
  }
  await currentQueue.add(MEETING_ANSWER_JOB_NAME, data, { ...jobOptions(), jobId });
}

export async function enqueueMeetingAnswerJobs(jobs: MeetingAnswerJobData[]): Promise<void> {
  if (jobs.length === 0 || !redisUrl()) {
    return;
  }
  const currentQueue = getMeetingAnswerQueue();
  await Promise.all(jobs.map((job) => reconcileMeetingAnswerJob(currentQueue, job)));
}

export function createMeetingAnswerWorker(
  processJob: MeetingAnswerJobProcessor,
): Worker<MeetingAnswerJobData> {
  const parsed = Number.parseInt(process.env.MEETING_ANSWER_CONCURRENCY || "4", 10);
  const concurrency = Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  const worker = new Worker<MeetingAnswerJobData>(
    MEETING_ANSWER_QUEUE_NAME,
    async (job) => {
      await processJob(meetingAnswerJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: typeof job.opts.attempts === "number" ? job.opts.attempts : 1,
      });
    },
    {
      concurrency,
      connection: createRedisConnection(),
      prefix: buildMeetingAnswerQueuePrefix(),
    },
  );
  worker.on("ready", () => {
    console.info("[meeting-answer-worker] ready", {
      concurrency,
      queue: MEETING_ANSWER_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[meeting-answer-worker] job failed", {
      errorName: error.name,
      exchangeId: job?.data.exchangeId,
      jobId: job?.id,
    });
  });
  worker.on("error", (error) => {
    console.error("[meeting-answer-worker] queue error", { errorName: error.name });
  });
  return worker;
}

export async function closeMeetingAnswerQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
