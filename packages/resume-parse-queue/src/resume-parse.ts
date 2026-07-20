import { createHash } from "node:crypto";
import { Queue, Worker } from "bullmq";
import type { ConnectionOptions, JobsOptions, JobState, JobType } from "bullmq";
import { z } from "zod";

export const RESUME_PARSE_QUEUE_NAME = "resume-parse";
export const RESUME_PARSE_QUEUE_DISPLAY_NAME = "简历解析";
export const RESUME_PARSE_JOB_NAME = "parse-resume-upload-item";
const RESUME_PARSE_COUNT_TYPES = [
  "waiting",
  "active",
  "delayed",
  "failed",
  "completed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;
export const RESUME_PARSE_JOB_LIST_STATES = ["all", ...RESUME_PARSE_COUNT_TYPES] as const;

const RESUME_PARSE_JOB_TYPES: JobType[] = [...RESUME_PARSE_COUNT_TYPES];

export const resumeParseJobSchema = z.object({
  batchId: z.string().min(1),
  itemId: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export type ResumeParseJobData = z.infer<typeof resumeParseJobSchema>;
export type ResumeParseJobProcessor = (payload: ResumeParseJobData) => Promise<void>;
type ResumeParseCountState = (typeof RESUME_PARSE_COUNT_TYPES)[number];
export type ResumeParseJobListState = "all" | ResumeParseCountState;

export interface ResumeParseRedisSummary {
  db: number;
  host: string;
  port: number;
  prefix: string;
  protocol: string;
  usesPassword: boolean;
  usesUsername: boolean;
}

export type ResumeParseQueueCounts = Record<(typeof RESUME_PARSE_COUNT_TYPES)[number], number>;

export interface ResumeParseQueueOverview {
  counts: ResumeParseQueueCounts;
  displayName: string;
  name: typeof RESUME_PARSE_QUEUE_NAME;
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

export interface ResumeParseQueueJobRecord {
  attemptsMade: number;
  attemptsStarted: number | null;
  data: ResumeParseJobData | unknown;
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

export interface ResumeParseQueueJobsResult {
  page: number;
  pageSize: number;
  records: ResumeParseQueueJobRecord[];
  state: ResumeParseJobListState;
  total: number;
  totalPages: number;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 30_000;
const DEFAULT_CONCURRENCY = 9;

let queue: Queue<ResumeParseJobData> | null = null;

function redisUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.REDIS_URL?.trim();
  return value || null;
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

export function buildResumeParseQueuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RESUME_PARSE_QUEUE_PREFIX?.trim();
  if (explicit) {
    return explicit;
  }
  const hash = createHash("sha256").update(databaseQueueScope(env)).digest("hex").slice(0, 12);
  return `arc:resume-parse:${hash}`;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRedisConnectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    db: parsed.pathname ? Number.parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    host: parsed.hostname,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
  };
}

function createRedisConnection(env: NodeJS.ProcessEnv = process.env): ConnectionOptions {
  const url = redisUrl(env);
  if (!url) {
    throw new Error("REDIS_URL is not set.");
  }
  return createRedisConnectionFromUrl(url);
}

export function isResumeParseQueueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(redisUrl(env));
}

export function getResumeParseRedisSummary(
  env: NodeJS.ProcessEnv = process.env,
): ResumeParseRedisSummary | null {
  const url = redisUrl(env);
  if (!url) {
    return null;
  }
  const parsed = new URL(url);
  return {
    db: parsed.pathname ? Number.parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    prefix: buildResumeParseQueuePrefix(env),
    protocol: parsed.protocol,
    usesPassword: Boolean(parsed.password),
    usesUsername: Boolean(parsed.username),
  };
}

export function getResumeParseQueue(): Queue<ResumeParseJobData> {
  if (!queue) {
    queue = new Queue<ResumeParseJobData>(RESUME_PARSE_QUEUE_NAME, {
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    });
  }
  return queue;
}

export function defaultResumeParseJobOptions(env: NodeJS.ProcessEnv = process.env): JobsOptions {
  return {
    attempts: parsePositiveInteger(env.RESUME_PARSE_QUEUE_ATTEMPTS, DEFAULT_ATTEMPTS),
    backoff: {
      delay: parsePositiveInteger(env.RESUME_PARSE_QUEUE_BACKOFF_MS, DEFAULT_BACKOFF_MS),
      type: "exponential",
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };
}

export function buildResumeParseJobId(itemId: string): string {
  return itemId.replaceAll(":", "-");
}

export function shouldRemoveExistingResumeParseJob(state: string | null | undefined): boolean {
  return state === "completed" || state === "failed";
}

export function shouldRemoveCancelledResumeParseJob(state: string | null | undefined): boolean {
  return (
    state === "waiting" ||
    state === "delayed" ||
    state === "prioritized" ||
    state === "waiting-children" ||
    state === "paused"
  );
}

export async function enqueueResumeParseJobs(jobs: ResumeParseJobData[]): Promise<void> {
  if (jobs.length === 0) {
    return;
  }
  const q = getResumeParseQueue();
  const options = defaultResumeParseJobOptions();
  await Promise.all(
    jobs.map(async (data) => {
      const job = await q.getJob(buildResumeParseJobId(data.itemId));
      if (!job) {
        return;
      }
      const state = await job.getState();
      if (shouldRemoveExistingResumeParseJob(state)) {
        await job.remove();
      }
    }),
  );
  await q.addBulk(
    jobs.map((data) => ({
      data,
      name: RESUME_PARSE_JOB_NAME,
      opts: {
        ...options,
        jobId: buildResumeParseJobId(data.itemId),
      },
    })),
  );
}

export async function removeResumeParseJobs(itemIds: string[]): Promise<{
  failed: number;
  missing: number;
  removed: number;
  requested: number;
  skipped: number;
}> {
  if (itemIds.length === 0) {
    return { failed: 0, missing: 0, removed: 0, requested: 0, skipped: 0 };
  }
  const q = getResumeParseQueue();
  const result = {
    failed: 0,
    missing: 0,
    removed: 0,
    requested: itemIds.length,
    skipped: 0,
  };
  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        const job = await q.getJob(buildResumeParseJobId(itemId));
        if (!job) {
          result.missing += 1;
          return;
        }
        const state = await job.getState();
        if (!shouldRemoveCancelledResumeParseJob(state)) {
          result.skipped += 1;
          return;
        }
        await job.remove();
        result.removed += 1;
      } catch {
        result.failed += 1;
      }
    }),
  );
  return result;
}

export function getResumeParseQueueStats() {
  const q = getResumeParseQueue();
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
  q: Queue<ResumeParseJobData>,
): Promise<ResumeParseQueueOverview["workers"]> {
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
  job: Awaited<ReturnType<Queue<ResumeParseJobData>["getJob"]>>,
): Promise<ResumeParseQueueJobRecord | null> {
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

function stateToJobTypes(state: ResumeParseJobListState): JobType[] {
  return state === "all" ? [...RESUME_PARSE_JOB_TYPES] : [state];
}

function getCountTotal(
  counts: Partial<Record<ResumeParseCountState, number>>,
  state: ResumeParseJobListState,
): number {
  const states: readonly ResumeParseCountState[] =
    state === "all" ? RESUME_PARSE_COUNT_TYPES : [state];
  return states.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

export async function getResumeParseQueueOverview(): Promise<ResumeParseQueueOverview> {
  const redis = getResumeParseRedisSummary();
  if (!redis) {
    return {
      counts: emptyCounts(),
      displayName: RESUME_PARSE_QUEUE_DISPLAY_NAME,
      name: RESUME_PARSE_QUEUE_NAME,
      redis: null,
      workers: [],
      workersCount: 0,
    };
  }

  const q = getResumeParseQueue();
  const [counts, workersCount, workers] = await Promise.all([
    q.getJobCounts(...RESUME_PARSE_COUNT_TYPES),
    q.getWorkersCount().catch(() => 0),
    readWorkers(q),
  ]);

  return {
    counts: { ...emptyCounts(), ...counts },
    displayName: RESUME_PARSE_QUEUE_DISPLAY_NAME,
    name: RESUME_PARSE_QUEUE_NAME,
    redis,
    workers,
    workersCount,
  };
}

export async function listResumeParseQueueJobs({
  page,
  pageSize,
  search,
  state,
}: {
  page: number;
  pageSize: number;
  search?: string;
  state: ResumeParseJobListState;
}): Promise<ResumeParseQueueJobsResult> {
  if (!isResumeParseQueueConfigured()) {
    return {
      page,
      pageSize,
      records: [],
      state,
      total: 0,
      totalPages: 0,
    };
  }

  const q = getResumeParseQueue();
  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.max(1, Math.min(pageSize, 100));
  const counts = await q.getJobCounts(...RESUME_PARSE_COUNT_TYPES);

  if (search?.trim()) {
    const job = await q.getJob(buildResumeParseJobId(search.trim()));
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
  const records = serializedJobs.filter((job): job is ResumeParseQueueJobRecord => job !== null);

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    records,
    state,
    total,
    totalPages: Math.max(1, Math.ceil(total / normalizedPageSize)),
  };
}

export async function closeResumeParseQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}

export function createResumeParseWorker(
  processJob: ResumeParseJobProcessor,
): Worker<ResumeParseJobData> {
  const worker = new Worker<ResumeParseJobData>(
    RESUME_PARSE_QUEUE_NAME,
    async (job) => {
      const payload = resumeParseJobSchema.parse(job.data);
      await processJob(payload);
    },
    {
      concurrency: parsePositiveInteger(
        process.env.RESUME_PARSE_WORKER_CONCURRENCY,
        DEFAULT_CONCURRENCY,
      ),
      connection: createRedisConnection(),
      prefix: buildResumeParseQueuePrefix(),
    },
  );

  worker.on("ready", () => {
    console.info("[resume-parse-worker] ready", {
      concurrency: parsePositiveInteger(
        process.env.RESUME_PARSE_WORKER_CONCURRENCY,
        DEFAULT_CONCURRENCY,
      ),
      queue: RESUME_PARSE_QUEUE_NAME,
    });
  });
  worker.on("active", (job) => {
    console.info("[resume-parse-worker] job active", {
      attemptsMade: job.attemptsMade,
      itemId: job.data.itemId,
      jobId: job.id,
    });
  });
  worker.on("completed", (job) => {
    console.info("[resume-parse-worker] job completed", {
      itemId: job.data.itemId,
      jobId: job.id,
    });
  });
  worker.on("failed", (job, error) => {
    console.error("[resume-parse-worker] job failed", {
      error,
      itemId: job?.data.itemId,
      jobId: job?.id,
    });
  });
  worker.on("error", (error) => {
    console.error("[resume-parse-worker] worker error", error);
  });

  return worker;
}
