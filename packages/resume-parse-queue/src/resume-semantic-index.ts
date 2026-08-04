import { Queue, Worker } from "bullmq";
import type { JobsOptions } from "bullmq";
import { z } from "zod";
import {
  buildResumeParseQueuePrefix,
  createRedisConnectionFromUrl,
  defaultResumeParseJobOptions,
  isResumeParseQueueConfigured,
  shouldRemoveExistingResumeParseJob,
} from "./resume-parse";

export const RESUME_SEMANTIC_INDEX_QUEUE_NAME = "resume-semantic-index";
export const RESUME_SEMANTIC_INDEX_JOB_NAME = "index-resume-semantic";

export const resumeSemanticIndexJobSchema = z.object({
  organizationId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceType: z.enum(["studio_interview", "resume_pool_item", "job_description"]),
});

export type ResumeSemanticIndexJobData = z.infer<typeof resumeSemanticIndexJobSchema>;
export type ResumeSemanticIndexJobProcessor = (
  payload: ResumeSemanticIndexJobData,
) => Promise<void>;

let queue: Queue<ResumeSemanticIndexJobData> | null = null;

function redisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.REDIS_URL?.trim();
  return value || null;
}

function createRedisConnection(env: NodeJS.ProcessEnv = process.env) {
  const url = redisUrl(env);
  if (!url) {
    throw new Error("REDIS_URL is not set.");
  }
  return createRedisConnectionFromUrl(url);
}

function jobOptions(): JobsOptions {
  return {
    ...defaultResumeParseJobOptions(),
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
  };
}

export function buildResumeSemanticIndexJobId({
  sourceId,
  sourceType,
}: Pick<ResumeSemanticIndexJobData, "sourceId" | "sourceType">): string {
  return `${sourceType}-${sourceId.replaceAll(":", "-")}`;
}

export function resolveResumeSemanticIndexWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = Number.parseInt(env.RESUME_SEMANTIC_INDEX_WORKER_CONCURRENCY || "16", 10);
  return Number.isFinite(value) && value > 0 ? value : 16;
}

export function getResumeSemanticIndexQueue(): Queue<ResumeSemanticIndexJobData> {
  if (!queue) {
    queue = new Queue<ResumeSemanticIndexJobData>(RESUME_SEMANTIC_INDEX_QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    });
  }
  return queue;
}

export async function enqueueResumeSemanticIndexJobs(
  jobs: ResumeSemanticIndexJobData[],
): Promise<void> {
  if (jobs.length === 0 || !isResumeParseQueueConfigured()) {
    return;
  }
  const q = getResumeSemanticIndexQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const existing = await q.getJob(buildResumeSemanticIndexJobId(data));
      if (!existing) {
        return;
      }
      const state = await existing.getState();
      if (shouldRemoveExistingResumeParseJob(state)) {
        await existing.remove();
      }
    }),
  );
  await q.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_SEMANTIC_INDEX_JOB_NAME,
      opts: {
        ...jobOptions(),
        jobId: buildResumeSemanticIndexJobId(data),
      },
    })),
  );
}

export function createResumeSemanticIndexWorker(
  processJob: ResumeSemanticIndexJobProcessor,
): Worker<ResumeSemanticIndexJobData> {
  const worker = new Worker<ResumeSemanticIndexJobData>(
    RESUME_SEMANTIC_INDEX_QUEUE_NAME,
    async (job) => {
      const payload = resumeSemanticIndexJobSchema.parse(job.data);
      await processJob(payload);
    },
    {
      concurrency: resolveResumeSemanticIndexWorkerConcurrency(),
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    },
  );

  worker.on("ready", () => {
    console.info("[resume-semantic-index-worker] ready", {
      concurrency: resolveResumeSemanticIndexWorkerConcurrency(),
      queue: RESUME_SEMANTIC_INDEX_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[resume-semantic-index-worker] job failed", {
      error,
      jobId: job?.id,
      sourceId: job?.data.sourceId,
      sourceType: job?.data.sourceType,
    });
  });

  return worker;
}

export async function closeResumeSemanticIndexQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
