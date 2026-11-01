import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions, JobType } from "bullmq";
import { z } from "zod";

export const MEETING_PLAYBACK_QUEUE_NAME = "meeting-playback";
export const MEETING_PLAYBACK_JOB_NAME = "generate-meeting-playback";

export const meetingPlaybackJobSchema = z.object({
  meetingId: z.string().min(1),
  organizationId: z.string().min(1),
});

export type MeetingPlaybackJobData = z.infer<typeof meetingPlaybackJobSchema>;
export type MeetingPlaybackJobProcessor = (payload: MeetingPlaybackJobData) => Promise<void>;

let queue: Queue<MeetingPlaybackJobData> | null = null;

interface MeetingQueueStatsPort {
  getJobCounts: (...types: JobType[]) => Promise<Record<string, number>>;
}

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

export function buildMeetingPlaybackQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MEETING_PLAYBACK_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseQueueScope(env)).digest("hex").slice(0, 12);
  return `arc:meeting-playback:${hash}`;
}

function jobOptions(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 5000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function isMeetingProcessingQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisUrl(env));
}

export function buildMeetingPlaybackJobId({ meetingId }: MeetingPlaybackJobData): string {
  return `meeting-playback-${meetingId.replaceAll(":", "-")}`;
}

export function resolveMeetingPlaybackWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number.parseInt(env.MEETING_PLAYBACK_WORKER_CONCURRENCY || "2", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

export function getMeetingPlaybackQueue(): Queue<MeetingPlaybackJobData> {
  queue ??= new Queue<MeetingPlaybackJobData>(MEETING_PLAYBACK_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: buildMeetingPlaybackQueuePrefix(),
  });
  return queue;
}

export async function getMeetingPlaybackQueueStats(
  currentQueue: MeetingQueueStatsPort = getMeetingPlaybackQueue(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const counts = await currentQueue.getJobCounts("waiting", "active", "delayed", "failed");
  return {
    active: counts.active ?? 0,
    concurrency: resolveMeetingPlaybackWorkerConcurrency(env),
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    waiting: counts.waiting ?? 0,
  };
}

export async function enqueueMeetingPlaybackJobs(jobs: MeetingPlaybackJobData[]): Promise<void> {
  if (jobs.length === 0 || !isMeetingProcessingQueueConfigured()) {
    return;
  }
  const currentQueue = getMeetingPlaybackQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const existing = await currentQueue.getJob(buildMeetingPlaybackJobId(data));
      if (!existing) {
        return;
      }
      const state = await existing.getState();
      if (state === "completed" || state === "failed") {
        await existing.remove();
      }
    }),
  );
  await currentQueue.addBulk(
    jobs.map((data) => ({
      data,
      name: MEETING_PLAYBACK_JOB_NAME,
      opts: { ...jobOptions(), jobId: buildMeetingPlaybackJobId(data) },
    })),
  );
}

export function createMeetingPlaybackWorker(
  processJob: MeetingPlaybackJobProcessor,
): Worker<MeetingPlaybackJobData> {
  const concurrency = resolveMeetingPlaybackWorkerConcurrency();
  const worker = new Worker<MeetingPlaybackJobData>(
    MEETING_PLAYBACK_QUEUE_NAME,
    async (job) => {
      await processJob(meetingPlaybackJobSchema.parse(job.data));
    },
    {
      concurrency,
      connection: createRedisConnection(),
      prefix: buildMeetingPlaybackQueuePrefix(),
    },
  );
  worker.on("ready", () => {
    console.info("[meeting-playback-worker] ready", {
      concurrency,
      queue: MEETING_PLAYBACK_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[meeting-playback-worker] job failed", {
      attempt: job?.attemptsMade,
      errorMessage: error.message,
      errorName: error.name,
      jobId: job?.id,
      meetingId: job?.data.meetingId,
    });
  });
  return worker;
}

export async function closeMeetingPlaybackQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
