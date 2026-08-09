import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions, JobType } from "bullmq";
import { z } from "zod";
import { meetingTranscriptionProviderSchema } from "@arc/shared/meeting-transcription";

export const MEETING_TRANSCRIPTION_QUEUE_NAME = "meeting-transcription";
export const MEETING_TRANSCRIPTION_JOB_NAME = "transcribe-final-meeting";
export const MEETING_TRANSCRIPTION_PIPELINE_VERSION = "final-v1";

export const meetingTranscriptionJobSchema = z.object({
  meetingId: z.string().min(1),
  model: z.string().min(1),
  organizationId: z.string().min(1),
  pipelineVersion: z.literal(MEETING_TRANSCRIPTION_PIPELINE_VERSION),
  policyRevision: z.number().int().positive(),
  provider: meetingTranscriptionProviderSchema,
  region: z.string().min(1),
  sourceManifestSha256: z.string().regex(/^[a-f\d]{64}$/i),
});

export type MeetingTranscriptionJobData = z.infer<typeof meetingTranscriptionJobSchema>;
export type MeetingTranscriptionJobProcessor = (
  payload: MeetingTranscriptionJobData,
  context: { attempt: number; maxAttempts: number },
) => Promise<void>;

let queue: Queue<MeetingTranscriptionJobData> | null = null;

interface MeetingTranscriptionQueuePort {
  add: (name: string, data: MeetingTranscriptionJobData, options: JobsOptions) => Promise<unknown>;
  getJob: (jobId: string) => Promise<
    | {
        getState: () => Promise<string>;
        remove: () => Promise<void>;
      }
    | undefined
  >;
}

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

export function buildMeetingTranscriptionQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MEETING_TRANSCRIPTION_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseQueueScope(env)).digest("hex").slice(0, 12);
  return `arc:meeting-transcription:${hash}`;
}

function jobOptions(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 10_000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function buildMeetingTranscriptionJobId(data: MeetingTranscriptionJobData): string {
  const snapshot = [
    data.meetingId,
    data.sourceManifestSha256,
    data.pipelineVersion,
    data.policyRevision,
    data.provider,
    data.model,
    data.region,
  ].join("|");
  const hash = createHash("sha256").update(snapshot).digest("hex").slice(0, 24);
  return `meeting-transcription-${data.meetingId.replaceAll(":", "-")}-${hash}`;
}

export function resolveMeetingTranscriptionWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number.parseInt(env.MEETING_TRANSCRIPTION_CONCURRENCY || "20", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

export function isMeetingTranscriptionQueueConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(redisUrl(env));
}

export function getMeetingTranscriptionQueue(): Queue<MeetingTranscriptionJobData> {
  queue ??= new Queue<MeetingTranscriptionJobData>(MEETING_TRANSCRIPTION_QUEUE_NAME, {
    connection: createRedisConnection(),
    prefix: buildMeetingTranscriptionQueuePrefix(),
  });
  return queue;
}

export async function getMeetingTranscriptionQueueStats(
  currentQueue: MeetingQueueStatsPort = getMeetingTranscriptionQueue(),
  env: NodeJS.ProcessEnv = process.env,
) {
  const counts = await currentQueue.getJobCounts("waiting", "active", "delayed", "failed");
  return {
    active: counts.active ?? 0,
    concurrency: resolveMeetingTranscriptionWorkerConcurrency(env),
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
    waiting: counts.waiting ?? 0,
  };
}

export async function reconcileMeetingTranscriptionJob(
  currentQueue: MeetingTranscriptionQueuePort,
  data: MeetingTranscriptionJobData,
): Promise<void> {
  const jobId = buildMeetingTranscriptionJobId(data);
  const existing = await currentQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state !== "completed" && state !== "failed") {
      return;
    }
    await existing.remove();
  }
  await currentQueue.add(MEETING_TRANSCRIPTION_JOB_NAME, data, {
    ...jobOptions(),
    jobId,
  });
}

export async function enqueueMeetingTranscriptionJobs(
  jobs: MeetingTranscriptionJobData[],
): Promise<void> {
  if (jobs.length === 0 || !redisUrl()) {
    return;
  }
  const currentQueue = getMeetingTranscriptionQueue();
  await Promise.all(jobs.map((data) => reconcileMeetingTranscriptionJob(currentQueue, data)));
}

export async function retryMeetingTranscriptionJob(
  data: MeetingTranscriptionJobData,
): Promise<void> {
  if (!isMeetingTranscriptionQueueConfigured()) {
    return;
  }
  await reconcileMeetingTranscriptionJob(getMeetingTranscriptionQueue(), data);
}

export function createMeetingTranscriptionWorker(
  processJob: MeetingTranscriptionJobProcessor,
): Worker<MeetingTranscriptionJobData> {
  const concurrency = resolveMeetingTranscriptionWorkerConcurrency();
  const worker = new Worker<MeetingTranscriptionJobData>(
    MEETING_TRANSCRIPTION_QUEUE_NAME,
    async (job) => {
      await processJob(meetingTranscriptionJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: typeof job.opts.attempts === "number" ? job.opts.attempts : 1,
      });
    },
    {
      concurrency,
      connection: createRedisConnection(),
      prefix: buildMeetingTranscriptionQueuePrefix(),
    },
  );
  worker.on("ready", () => {
    console.info("[meeting-transcription-worker] ready", {
      concurrency,
      queue: MEETING_TRANSCRIPTION_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[meeting-transcription-worker] job failed", {
      attempt: job?.attemptsMade,
      errorName: error.name,
      jobId: job?.id,
      meetingId: job?.data.meetingId,
    });
  });
  return worker;
}

export async function closeMeetingTranscriptionQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
