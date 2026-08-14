import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const MEETING_PURGE_QUEUE_NAME = "meeting-purge";
export const MEETING_PURGE_JOB_NAME = "purge-meeting";

export const meetingPurgeJobSchema = z.object({
  meetingId: z.string().min(1),
  organizationId: z.string().min(1),
});

export type MeetingPurgeJobData = z.infer<typeof meetingPurgeJobSchema>;
export type MeetingPurgeJobProcessor = (payload: MeetingPurgeJobData) => Promise<void>;

interface MeetingPurgeQueuePort {
  add: (name: string, data: MeetingPurgeJobData, options: JobsOptions) => Promise<unknown>;
  getJob: (jobId: string) => Promise<
    | {
        getState: () => Promise<string>;
        remove: () => Promise<void>;
      }
    | undefined
  >;
}

let queue: Queue<MeetingPurgeJobData> | null = null;

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

export function buildMeetingPurgeQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MEETING_PURGE_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseQueueScope(env)).digest("hex").slice(0, 12);
  return `arc:meeting-purge:${hash}`;
}

export function buildMeetingPurgeJobId({ meetingId }: MeetingPurgeJobData): string {
  return `meeting-purge-${meetingId.replaceAll(":", "-")}`;
}

export function isMeetingPurgeQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisUrl(env));
}

export function resolveMeetingPurgeWorkerConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.MEETING_PURGE_CONCURRENCY || "2", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

function jobOptions(): JobsOptions {
  return {
    attempts: 10,
    backoff: { delay: 10_000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function getMeetingPurgeQueue(): Queue<MeetingPurgeJobData> {
  queue ??= new Queue<MeetingPurgeJobData>(MEETING_PURGE_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: buildMeetingPurgeQueuePrefix(),
  });
  return queue;
}

export async function reconcileMeetingPurgeJob(
  currentQueue: MeetingPurgeQueuePort,
  data: MeetingPurgeJobData,
): Promise<void> {
  const jobId = buildMeetingPurgeJobId(data);
  const existing = await currentQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "completed" && state !== "failed") {
      return;
    }
    await existing.remove();
  }
  await currentQueue.add(MEETING_PURGE_JOB_NAME, data, { ...jobOptions(), jobId });
}

export async function enqueueMeetingPurgeJobs(jobs: MeetingPurgeJobData[]): Promise<void> {
  if (jobs.length === 0 || !isMeetingPurgeQueueConfigured()) {
    return;
  }
  const currentQueue = getMeetingPurgeQueue();
  await Promise.all(jobs.map((job) => reconcileMeetingPurgeJob(currentQueue, job)));
}

export function createMeetingPurgeWorker(
  processJob: MeetingPurgeJobProcessor,
): Worker<MeetingPurgeJobData> {
  const concurrency = resolveMeetingPurgeWorkerConcurrency();
  const worker = new Worker<MeetingPurgeJobData>(
    MEETING_PURGE_QUEUE_NAME,
    (job) => processJob(meetingPurgeJobSchema.parse(job.data)),
    {
      concurrency,
      connection: createRedisConnection(),
      prefix: buildMeetingPurgeQueuePrefix(),
    },
  );
  worker.on("failed", (job, error) => {
    console.error("[meeting-purge-worker] job failed", {
      errorName: error.name,
      jobId: job?.id,
      meetingId: job?.data.meetingId,
    });
  });
  return worker;
}

export async function closeMeetingPurgeQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
