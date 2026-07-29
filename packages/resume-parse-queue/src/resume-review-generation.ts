import { Queue, Worker } from "bullmq";
import type { JobsOptions, JobState, JobType } from "bullmq";
import { z } from "zod";
import {
  buildResumeParseQueuePrefix,
  createRedisConnectionFromUrl,
  defaultResumeParseJobOptions,
  getResumeParseRedisSummary,
  isResumeParseQueueConfigured,
  shouldRemoveExistingResumeParseJob,
} from "./resume-parse";
import type { ResumeParseQueueCounts, ResumeParseRedisSummary } from "./resume-parse";

export const RESUME_REVIEW_GENERATION_QUEUE_NAME = "resume-review-generation";
export const RESUME_REVIEW_GENERATION_QUEUE_DISPLAY_NAME = "AI分析";
export const RESUME_REVIEW_GENERATION_JOB_NAME = "generate-resume-review";
const RESUME_REVIEW_GENERATION_COUNT_TYPES = [
  "waiting",
  "active",
  "delayed",
  "failed",
  "completed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;
export const RESUME_REVIEW_GENERATION_JOB_LIST_STATES = [
  "all",
  ...RESUME_REVIEW_GENERATION_COUNT_TYPES,
] as const;

const RESUME_REVIEW_GENERATION_JOB_TYPES: JobType[] = [...RESUME_REVIEW_GENERATION_COUNT_TYPES];

const resumeRecordReviewJobSchema = z.object({
  autoMatchJobDescription: z.boolean().optional(),
  force: z.boolean().optional(),
  generationToken: z.string().min(1).optional(),
  jobDescriptionId: z.string().min(1).nullable(),
  organizationId: z.string().min(1),
  poolItemId: z.string().min(1).optional(),
  reassessToken: z.string().min(1).optional(),
  resumeRecordId: z.string().min(1),
  runId: z.string().min(1),
  source: z.enum(["resume_pool_import", "reassess", "resume_upload"]),
});

const resumePoolReviewJobSchema = z.object({
  autoMatchJobDescription: z.boolean().optional(),
  force: z.boolean().optional(),
  generationToken: z.string().min(1).optional(),
  jobDescriptionId: z.string().min(1).nullable(),
  organizationId: z.string().min(1),
  poolItemId: z.string().min(1),
  reassessToken: z.string().min(1).optional(),
  source: z.literal("resume_pool_upload"),
});

export const resumeReviewGenerationJobSchema = z.discriminatedUnion("source", [
  resumeRecordReviewJobSchema,
  resumePoolReviewJobSchema,
]);

export type ResumeReviewGenerationJobData = z.infer<typeof resumeReviewGenerationJobSchema>;
export type ResumeReviewGenerationJobProcessor = (
  payload: ResumeReviewGenerationJobData,
) => Promise<void>;
type ResumeReviewGenerationCountState = (typeof RESUME_REVIEW_GENERATION_COUNT_TYPES)[number];
export type ResumeReviewGenerationJobListState = "all" | ResumeReviewGenerationCountState;

export interface ResumeReviewGenerationQueueOverview {
  counts: ResumeParseQueueCounts;
  displayName: string;
  name: typeof RESUME_REVIEW_GENERATION_QUEUE_NAME;
  redis: ResumeParseRedisSummary | null;
  workers: {
    addr?: string;
    age?: string;
    cmd?: string;
    db?: string;
    flags?: string;
    id?: string;
    idle?: string;
    name?: string;
  }[];
  workersCount: number;
}

export interface ResumeReviewGenerationQueueJobRecord {
  attemptsMade: number;
  attemptsStarted: number | null;
  data: ResumeReviewGenerationJobData | unknown;
  failedReason: string | null;
  finishedOn: string | null;
  id: string;
  name: string;
  processedBy: string | null;
  processedOn: string | null;
  progress: unknown;
  returnvalue: unknown;
  state: JobState | "paused" | "unknown";
  timestamp: string | null;
}

export interface ResumeReviewGenerationQueueJobsResult {
  page: number;
  pageSize: number;
  records: ResumeReviewGenerationQueueJobRecord[];
  state: ResumeReviewGenerationJobListState;
  total: number;
  totalPages: number;
}

let queue: Queue<ResumeReviewGenerationJobData> | null = null;

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

function normalizeJobIdPart(value: string): string {
  return value.replaceAll(":", "-");
}

export function buildResumeReviewGenerationJobId(input: {
  force?: boolean;
  generationToken?: string;
  jobDescriptionId: string | null;
  poolItemId?: string;
  reassessToken?: string;
  resumeRecordId?: string;
  runId?: string;
  source?: ResumeReviewGenerationJobData["source"];
}): string {
  if (input.source === "resume_pool_upload") {
    const { poolItemId } = input;
    if (!poolItemId) {
      throw new Error("Pool review jobs require poolItemId.");
    }
    const jobDescriptionId = input.jobDescriptionId
      ? normalizeJobIdPart(input.jobDescriptionId)
      : "no-jd";
    const base = `resume-pool-review-${normalizeJobIdPart(poolItemId)}-${jobDescriptionId}`;
    return input.generationToken
      ? `${base}-parse-${normalizeJobIdPart(input.generationToken)}`
      : base;
  }
  if (!input.resumeRecordId) {
    throw new Error("Resume review jobs require resumeRecordId.");
  }
  const jobDescriptionId = input.jobDescriptionId
    ? normalizeJobIdPart(input.jobDescriptionId)
    : "no-jd";
  const base = `resume-review-${normalizeJobIdPart(input.resumeRecordId)}-${jobDescriptionId}`;
  if (input.runId) {
    return `${base}-run-${normalizeJobIdPart(input.runId)}`;
  }
  if (input.generationToken) {
    return `${base}-parse-${normalizeJobIdPart(input.generationToken)}`;
  }
  // Reassess must not collide with completed first-generation job ids.
  if (input.force || input.reassessToken) {
    return `${base}-reassess-${normalizeJobIdPart(input.reassessToken ?? crypto.randomUUID())}`;
  }
  return base;
}

export function resolveResumeReviewGenerationWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const value = Number.parseInt(
    env.RESUME_REVIEW_GENERATION_WORKER_CONCURRENCY || env.RESUME_PARSE_WORKER_CONCURRENCY || "9",
    10,
  );
  return Number.isFinite(value) && value > 0 ? value : 9;
}

export function isResumeReviewGenerationQueueConfigured(): boolean {
  return isResumeParseQueueConfigured();
}

export function getResumeReviewGenerationQueue(): Queue<ResumeReviewGenerationJobData> {
  if (!queue) {
    queue = new Queue<ResumeReviewGenerationJobData>(RESUME_REVIEW_GENERATION_QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    });
  }
  return queue;
}

export function getResumeReviewGenerationQueueStats() {
  const q = getResumeReviewGenerationQueue();
  return q.getJobCounts("waiting", "active", "delayed", "failed", "completed", "paused");
}

function emptyCounts(): ResumeParseQueueCounts {
  return {
    active: 0,
    completed: 0,
    delayed: 0,
    failed: 0,
    paused: 0,
    prioritized: 0,
    waiting: 0,
    "waiting-children": 0,
  };
}

function toIsoString(value: number | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

async function readWorkers(
  q: Queue<ResumeReviewGenerationJobData>,
): Promise<ResumeReviewGenerationQueueOverview["workers"]> {
  try {
    const workers = await q.getWorkers();
    return workers.map((worker) => ({
      addr: worker.addr,
      age: worker.age,
      cmd: worker.cmd,
      db: worker.db,
      flags: worker.flags,
      id: worker.id,
      idle: worker.idle,
      name: worker.name,
    }));
  } catch {
    return [];
  }
}

async function serializeJob(
  job: Awaited<ReturnType<Queue<ResumeReviewGenerationJobData>["getJob"]>>,
): Promise<ResumeReviewGenerationQueueJobRecord | null> {
  if (!job) {
    return null;
  }
  const json = job.asJSON();
  const state = await job.getState();
  return {
    attemptsMade: json.attemptsMade,
    attemptsStarted: json.attemptsStarted ?? null,
    data: job.data,
    failedReason: json.failedReason || null,
    finishedOn: toIsoString(json.finishedOn),
    id: json.id,
    name: json.name,
    processedBy: json.processedBy ?? null,
    processedOn: toIsoString(json.processedOn),
    progress: job.progress,
    returnvalue: job.returnvalue,
    state,
    timestamp: toIsoString(json.timestamp),
  };
}

function stateToJobTypes(state: ResumeReviewGenerationJobListState): JobType[] {
  return state === "all" ? [...RESUME_REVIEW_GENERATION_JOB_TYPES] : [state];
}

function getCountTotal(
  counts: Partial<Record<ResumeReviewGenerationCountState, number>>,
  state: ResumeReviewGenerationJobListState,
): number {
  const states: readonly ResumeReviewGenerationCountState[] =
    state === "all" ? RESUME_REVIEW_GENERATION_COUNT_TYPES : [state];
  return states.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

export async function getResumeReviewGenerationQueueOverview(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResumeReviewGenerationQueueOverview> {
  const redis = getResumeParseRedisSummary(env);
  if (!redis) {
    return {
      counts: emptyCounts(),
      displayName: RESUME_REVIEW_GENERATION_QUEUE_DISPLAY_NAME,
      name: RESUME_REVIEW_GENERATION_QUEUE_NAME,
      redis: null,
      workers: [],
      workersCount: 0,
    };
  }

  const q = getResumeReviewGenerationQueue();
  const [counts, workersCount, workers] = await Promise.all([
    q.getJobCounts(...RESUME_REVIEW_GENERATION_COUNT_TYPES),
    q.getWorkersCount().catch(() => 0),
    readWorkers(q),
  ]);

  return {
    counts: { ...emptyCounts(), ...counts },
    displayName: RESUME_REVIEW_GENERATION_QUEUE_DISPLAY_NAME,
    name: RESUME_REVIEW_GENERATION_QUEUE_NAME,
    redis,
    workers,
    workersCount,
  };
}

export async function listResumeReviewGenerationQueueJobs({
  page,
  pageSize,
  search,
  state,
}: {
  page: number;
  pageSize: number;
  search?: string;
  state: ResumeReviewGenerationJobListState;
}): Promise<ResumeReviewGenerationQueueJobsResult> {
  if (!isResumeReviewGenerationQueueConfigured()) {
    return {
      page,
      pageSize,
      records: [],
      state,
      total: 0,
      totalPages: 0,
    };
  }

  const q = getResumeReviewGenerationQueue();
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.max(1, Math.min(pageSize, 100));
  const counts = await q.getJobCounts(...RESUME_REVIEW_GENERATION_COUNT_TYPES);

  if (search?.trim()) {
    const job = await q.getJob(search.trim());
    const record = await serializeJob(job);
    const records = record && (state === "all" || record.state === state) ? [record] : [];
    return {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      records,
      state,
      total: records.length,
      totalPages: records.length > 0 ? 1 : 0,
    };
  }

  const total = getCountTotal(counts, state);
  const start = (normalizedPage - 1) * normalizedPageSize;
  const end = start + normalizedPageSize - 1;
  const jobs = await q.getJobs(stateToJobTypes(state), start, end, false);
  const serializedJobs = await Promise.all(jobs.map((job) => serializeJob(job)));
  const records = serializedJobs.filter(
    (job): job is ResumeReviewGenerationQueueJobRecord => job !== null,
  );

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    records,
    state,
    total,
    totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
  };
}

export async function enqueueResumeReviewGenerationJobs(
  jobs: ResumeReviewGenerationJobData[],
): Promise<void> {
  if (jobs.length === 0 || !isResumeReviewGenerationQueueConfigured()) {
    return;
  }
  const q = getResumeReviewGenerationQueue();
  await Promise.all(
    jobs.map(async (data) => {
      const existing = await q.getJob(buildResumeReviewGenerationJobId(data));
      if (!existing) {
        return;
      }
      const state = await existing.getState();
      if (
        state === "failed" ||
        (!data.generationToken && shouldRemoveExistingResumeParseJob(state))
      ) {
        await existing.remove();
      }
    }),
  );
  await q.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_REVIEW_GENERATION_JOB_NAME,
      opts: {
        ...jobOptions(),
        jobId: buildResumeReviewGenerationJobId(data),
      },
    })),
  );
}

export function createResumeReviewGenerationWorker(
  processJob: ResumeReviewGenerationJobProcessor,
): Worker<ResumeReviewGenerationJobData> {
  const worker = new Worker<ResumeReviewGenerationJobData>(
    RESUME_REVIEW_GENERATION_QUEUE_NAME,
    async (job) => {
      const payload = resumeReviewGenerationJobSchema.parse(job.data);
      await processJob(payload);
    },
    {
      concurrency: resolveResumeReviewGenerationWorkerConcurrency(),
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    },
  );

  worker.on("ready", () => {
    console.info("[resume-review-generation-worker] ready", {
      concurrency: resolveResumeReviewGenerationWorkerConcurrency(),
      queue: RESUME_REVIEW_GENERATION_QUEUE_NAME,
    });
  });
  worker.on("failed", (job, error) => {
    const data = job?.data;
    console.error("[resume-review-generation-worker] job failed", {
      error,
      jobDescriptionId: data?.jobDescriptionId,
      jobId: job?.id,
      poolItemId: data?.poolItemId,
      resumeRecordId: data && "resumeRecordId" in data ? data.resumeRecordId : undefined,
    });
  });

  return worker;
}

export async function closeResumeReviewGenerationQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
