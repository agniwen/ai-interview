import { Queue, Worker } from "bullmq";
import type { JobsOptions } from "bullmq";
import { z } from "zod";
import {
  buildResumeParseQueuePrefix,
  createRedisConnectionFromUrl,
  isResumeParseQueueConfigured,
} from "./resume-parse";

export const MAIL_INGEST_TRIGGER_QUEUE_NAME = "mail-ingest-trigger";
export const MAIL_INGEST_TRIGGER_JOB_NAME = "poll-mail-ingest-now";

export const mailIngestTriggerJobSchema = z.object({
  organizationId: z.string().min(1),
});

export type MailIngestTriggerJobData = z.infer<typeof mailIngestTriggerJobSchema>;
export type MailIngestTriggerJobProcessor = (payload: MailIngestTriggerJobData) => Promise<void>;

let queue: Queue<MailIngestTriggerJobData> | null = null;

function createRedisConnection(env: NodeJS.ProcessEnv = process.env) {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    throw new Error("REDIS_URL is not set.");
  }
  return createRedisConnectionFromUrl(url);
}

export function isMailIngestTriggerQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isResumeParseQueueConfigured(env);
}

function getMailIngestTriggerQueue(): Queue<MailIngestTriggerJobData> {
  if (!queue) {
    queue = new Queue<MailIngestTriggerJobData>(MAIL_INGEST_TRIGGER_QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    });
  }
  return queue;
}

function mailIngestTriggerJobOptions(): JobsOptions {
  return {
    attempts: 3,
    backoff: { delay: 1000, type: "exponential" },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  };
}

export async function enqueueMailIngestTrigger(data: MailIngestTriggerJobData): Promise<void> {
  const payload = mailIngestTriggerJobSchema.parse(data);
  await getMailIngestTriggerQueue().add(MAIL_INGEST_TRIGGER_JOB_NAME, payload, {
    ...mailIngestTriggerJobOptions(),
  });
}

export function createMailIngestTriggerWorker(
  processJob: MailIngestTriggerJobProcessor,
): Worker<MailIngestTriggerJobData> {
  const worker = new Worker<MailIngestTriggerJobData>(
    MAIL_INGEST_TRIGGER_QUEUE_NAME,
    async (job) => {
      await processJob(mailIngestTriggerJobSchema.parse(job.data));
    },
    {
      concurrency: 1,
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    },
  );
  worker.on("error", (error) => {
    console.error("[mail-ingest-trigger-worker] worker error", error);
  });
  return worker;
}
