import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions } from "bullmq";
import { z } from "zod";

export const HUMAN_INTERVIEW_EVALUATION_QUEUE_NAME = "human-interview-evaluation";
export const HUMAN_INTERVIEW_EVALUATION_JOB_NAME = "generate-human-interview-evaluation";

export const humanInterviewEvaluationJobSchema = z.object({
  meetingSessionId: z.string().min(1),
  organizationId: z.string().min(1),
  roundId: z.string().min(1),
  transcriptRevisionId: z.string().min(1),
});
export type HumanInterviewEvaluationJobData = z.infer<typeof humanInterviewEvaluationJobSchema>;

let queue: Queue<HumanInterviewEvaluationJobData> | null = null;

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
  return `arc:human-interview-evaluation:${createHash("sha256")
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

export function isHumanInterviewEvaluationQueueConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

function getQueue() {
  queue ??= new Queue<HumanInterviewEvaluationJobData>(HUMAN_INTERVIEW_EVALUATION_QUEUE_NAME, {
    connection: connection(),
    prefix: prefix(),
  });
  return queue;
}

export function buildHumanInterviewEvaluationJobId(data: HumanInterviewEvaluationJobData) {
  const hash = createHash("sha256")
    .update(`${data.roundId}|${data.transcriptRevisionId}`)
    .digest("hex")
    .slice(0, 24);
  return `human-interview-evaluation-${hash}`;
}

export async function enqueueHumanInterviewEvaluationJobs(
  jobs: HumanInterviewEvaluationJobData[],
): Promise<void> {
  if (jobs.length === 0 || !isHumanInterviewEvaluationQueueConfigured()) {
    return;
  }
  const current = getQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const jobId = buildHumanInterviewEvaluationJobId(data);
      const existing = await current.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state !== "completed" && state !== "failed") {
          return;
        }
        await existing.remove();
      }
      await current.add(HUMAN_INTERVIEW_EVALUATION_JOB_NAME, data, { ...options(), jobId });
    }),
  );
}

export function createHumanInterviewEvaluationWorker(
  process: (
    data: HumanInterviewEvaluationJobData,
    context: { attempt: number; maxAttempts: number },
  ) => Promise<void>,
) {
  return new Worker<HumanInterviewEvaluationJobData>(
    HUMAN_INTERVIEW_EVALUATION_QUEUE_NAME,
    async (job) => {
      await process(humanInterviewEvaluationJobSchema.parse(job.data), {
        attempt: job.attemptsMade + 1,
        maxAttempts: Number(job.opts.attempts ?? 1),
      });
    },
    { connection: connection(), prefix: prefix() },
  );
}

export async function closeHumanInterviewEvaluationQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
