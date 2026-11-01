import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, Job, JobsOptions } from "bullmq";
import { z } from "zod";

export const HUMAN_INTERVIEW_RECORDING_QUEUE_NAME = "human-interview-recording";
export const HUMAN_INTERVIEW_RECORDING_JOB_NAME = "ingest-human-interview-recording";

const legacyRecordingJobSchema = z.object({
  candidateDurationMs: z.number().int().positive(),
  candidateEgressId: z.string().min(1),
  candidateFileKey: z.string().min(1),
  candidateSizeBytes: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  egressId: z.string().min(1),
  fileKey: z.string().min(1),
  meetingId: z.string().min(1),
  organizationId: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
export const humanInterviewTrackRecordingJobSchema = z.object({
  meetingId: z.string().min(1),
  organizationId: z.string().min(1),
  tracks: z
    .array(
      z.object({
        displayName: z.string().nullable(),
        durationMs: z.number().nonnegative(),
        egressId: z.string().nullable(),
        endedAtMs: z.number().nullable(),
        error: z.string().nullable(),
        fileKey: z.string().min(1),
        id: z.string().uuid(),
        participantIdentity: z.string().nullable(),
        publishedAtMs: z.number(),
        role: z.enum(["mixed", "candidate", "interviewer"]),
        sizeBytes: z.number().nonnegative(),
        startedAtMs: z.number().nullable(),
        status: z.enum(["starting", "active", "completed", "failed"]),
        trackId: z.string().min(1),
        unpublishedAtMs: z.number().nullable().optional(),
        updatedAtMs: z.number(),
      }),
    )
    .min(1)
    .max(200),
  version: z.literal(2),
});
export const humanInterviewRecordingJobSchema = z.union([
  legacyRecordingJobSchema,
  humanInterviewTrackRecordingJobSchema,
]);
export type HumanInterviewTrackRecordingJobData = z.infer<
  typeof humanInterviewTrackRecordingJobSchema
>;
export type HumanInterviewRecordingJobData = z.infer<typeof humanInterviewRecordingJobSchema>;

type Processor = (
  payload: HumanInterviewRecordingJobData,
  context: { attempt: number; maxAttempts: number },
) => Promise<void>;

let queue: Queue<HumanInterviewRecordingJobData> | null = null;

function redisConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const raw = env.REDIS_URL?.trim();
  if (!raw) {
    throw new Error("REDIS_URL is not set.");
  }
  const url = new URL(raw);
  return {
    db: url.pathname ? Number.parseInt(url.pathname.slice(1), 10) || 0 : 0,
    host: url.hostname,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number.parseInt(url.port, 10) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
  };
}

function queuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const scope = env.DATABASE_URL?.trim() || "no-database-url";
  return `arc:human-interview-recording:${createHash("sha256").update(scope).digest("hex").slice(0, 12)}`;
}

function jobOptions(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 10_000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function isHumanInterviewRecordingQueueConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

function getQueue(): Queue<HumanInterviewRecordingJobData> {
  queue ??= new Queue(HUMAN_INTERVIEW_RECORDING_QUEUE_NAME, {
    connection: redisConnection(),
    prefix: queuePrefix(),
  });
  return queue;
}

export function buildHumanInterviewRecordingJobId(data: HumanInterviewRecordingJobData): string {
  const suffix = createHash("sha256")
    .update(
      "tracks" in data
        ? JSON.stringify([
            data.meetingId,
            data.tracks
              .map(({ id, egressId, status, sizeBytes, startedAtMs }) => ({
                egressId,
                id,
                sizeBytes,
                startedAtMs,
                status,
              }))
              .toSorted((a, b) => a.id.localeCompare(b.id)),
          ])
        : `${data.meetingId}|${data.egressId}|${data.fileKey}|${data.candidateEgressId}|${data.candidateFileKey}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `human-interview-recording-${suffix}`;
}

export async function enqueueHumanInterviewRecordingJobs(
  jobs: HumanInterviewRecordingJobData[],
): Promise<void> {
  if (jobs.length === 0 || !isHumanInterviewRecordingQueueConfigured()) {
    return;
  }
  const current = getQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const jobId = buildHumanInterviewRecordingJobId(data);
      const existing = await current.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if ("tracks" in data && state === "completed") {
          return;
        }
        if (state !== "completed" && state !== "failed") {
          return;
        }
        await existing.remove();
      }
      await current.add(HUMAN_INTERVIEW_RECORDING_JOB_NAME, data, { ...jobOptions(), jobId });
    }),
  );
}

export function createHumanInterviewRecordingWorker(process: Processor) {
  return new Worker<HumanInterviewRecordingJobData>(
    HUMAN_INTERVIEW_RECORDING_QUEUE_NAME,
    async (job: Job<HumanInterviewRecordingJobData>) => {
      const parsedAttempts = z.number().int().positive().safeParse(job.opts.attempts);
      const attempts = parsedAttempts.success ? parsedAttempts.data : 1;
      await process(humanInterviewRecordingJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: attempts,
      });
    },
    { connection: redisConnection(), prefix: queuePrefix() },
  );
}

export async function closeHumanInterviewRecordingQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
