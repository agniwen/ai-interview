import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const INITIAL_INTERVIEW_EVALUATION_QUEUE_NAME = "initial-interview-evaluation";
export const INITIAL_INTERVIEW_EVALUATION_JOB_NAME = "generate-initial-interview-evaluation";

export const initialInterviewEvaluationJobSchema = z.object({
  organizationId: z.string().min(1),
  versionId: z.string().min(1),
});
export type InitialInterviewEvaluationJobData = z.infer<typeof initialInterviewEvaluationJobSchema>;

let queue: Queue<InitialInterviewEvaluationJobData> | null = null;

function connection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
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

function prefix(env: NodeJS.ProcessEnv = process.env): string {
  return `arc:initial-interview-evaluation:${createHash("sha256")
    .update(env.DATABASE_URL?.trim() || "no-database-url")
    .digest("hex")
    .slice(0, 12)}`;
}

function options(): JobsOptions {
  return {
    attempts: 5,
    backoff: { delay: 10_000, type: "exponential" },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function isInitialInterviewEvaluationQueueConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

function getQueue() {
  queue ??= new Queue<InitialInterviewEvaluationJobData>(INITIAL_INTERVIEW_EVALUATION_QUEUE_NAME, {
    connection: connection(),
    prefix: prefix(),
  });
  return queue;
}

export function buildInitialInterviewEvaluationJobId(data: InitialInterviewEvaluationJobData) {
  const hash = createHash("sha256")
    .update(`${data.organizationId}|${data.versionId}`)
    .digest("hex")
    .slice(0, 24);
  return `initial-interview-evaluation-${hash}`;
}

export async function enqueueInitialInterviewEvaluationJobs(
  jobs: InitialInterviewEvaluationJobData[],
): Promise<void> {
  if (jobs.length === 0 || !isInitialInterviewEvaluationQueueConfigured()) {
    return;
  }
  const current = getQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const jobId = buildInitialInterviewEvaluationJobId(data);
      const existing = await current.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state !== "completed" && state !== "failed") {
          return;
        }
        await existing.remove();
      }
      await current.add(INITIAL_INTERVIEW_EVALUATION_JOB_NAME, data, { ...options(), jobId });
    }),
  );
}

export function createInitialInterviewEvaluationWorker(
  process: (
    data: InitialInterviewEvaluationJobData,
    context: { attempt: number; maxAttempts: number },
  ) => Promise<void>,
) {
  return new Worker<InitialInterviewEvaluationJobData>(
    INITIAL_INTERVIEW_EVALUATION_QUEUE_NAME,
    async (job) => {
      await process(initialInterviewEvaluationJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: Number(job.opts.attempts ?? 1),
      });
    },
    { connection: connection(), prefix: prefix() },
  );
}

export async function closeInitialInterviewEvaluationQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
