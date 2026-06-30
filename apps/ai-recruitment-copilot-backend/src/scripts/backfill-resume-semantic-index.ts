import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, asc, count, eq, isNotNull, notExists, sql } from "drizzle-orm";
import { config as loadEnvFile } from "dotenv";
import { resumePoolItem, resumeSemanticIndex, studioInterview } from "@arc/db-schema/schema";
import type { Database } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { loadStandaloneEnv } from "../standalone/env";

type SemanticBackfillTarget = "all" | "pool" | "private_pool" | "public_pool" | "studio";
type SemanticBackfillRecord = ResumeSemanticIndexJobData;
type SemanticBackfillPoolScope = "private" | "public";

interface SemanticBackfillLog {
  [key: string]: unknown;
  event: string;
}

interface RunSemanticBackfillInput {
  concurrency: number;
  indexRecord: (record: SemanticBackfillRecord) => Promise<void>;
  log: (entry: SemanticBackfillLog) => void;
  records: SemanticBackfillRecord[];
}

interface SemanticBackfillSummary {
  failed: number;
  succeeded: number;
  total: number;
}

interface ResumeSemanticBackfillCliOptions {
  defaultTarget?: SemanticBackfillTarget;
}

const DEFAULT_SEMANTIC_BACKFILL_CONCURRENCY = 6;

export function parseSemanticBackfillConcurrency(value?: string): number {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_SEMANTIC_BACKFILL_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKFILL_RESUME_SEMANTIC_CONCURRENCY must be a positive integer.");
  }
  return parsed;
}

export function parseSemanticBackfillTarget(value?: string): SemanticBackfillTarget {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "all";
  }
  if (normalized === "all" || normalized === "pool") {
    return normalized;
  }
  if (normalized === "public" || normalized === "public_pool" || normalized === "plaza") {
    return "public_pool";
  }
  if (normalized === "resume_plaza" || normalized === "resume_pool_public") {
    return "public_pool";
  }
  if (normalized === "private_pool" || normalized === "resume_pool_private") {
    return "private_pool";
  }
  if (normalized === "studio" || normalized === "studio_interview" || normalized === "private") {
    return "studio";
  }
  throw new Error(
    "BACKFILL_RESUME_SEMANTIC_TARGET must be one of: all, studio, pool, public_pool, private_pool.",
  );
}

export function resolveSemanticBackfillTarget({
  defaultTarget = "all",
  rawTarget,
}: {
  defaultTarget?: SemanticBackfillTarget;
  rawTarget?: string;
} = {}): SemanticBackfillTarget {
  return parseSemanticBackfillTarget(rawTarget ?? defaultTarget);
}

export function resolveSemanticBackfillPoolScope(
  target: SemanticBackfillTarget,
): SemanticBackfillPoolScope | null {
  if (target === "public_pool") {
    return "public";
  }
  if (target === "private_pool") {
    return "private";
  }
  return null;
}

export function serializeSemanticBackfillLog(log: SemanticBackfillLog): string {
  return JSON.stringify(log);
}

function logEvent(log: SemanticBackfillLog): void {
  console.log(serializeSemanticBackfillLog({ timestamp: new Date().toISOString(), ...log }));
}

function parseOptionalPositiveInteger(value: string | undefined, name: string): number | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function calculateRemaining(completed: number, total: number): number {
  return Math.max(total - completed, 0);
}

export async function runResumeSemanticBackfillRecords({
  concurrency,
  indexRecord,
  log,
  records,
}: RunSemanticBackfillInput): Promise<SemanticBackfillSummary> {
  let completed = 0;
  let failed = 0;
  let nextIndex = 0;
  let succeeded = 0;

  const processRecord = async (record: SemanticBackfillRecord, index: number): Promise<void> => {
    log({
      event: "record_started",
      index: index + 1,
      organizationId: record.organizationId,
      recordCount: records.length,
      sourceId: record.sourceId,
      sourceType: record.sourceType,
    });

    try {
      await indexRecord(record);
      completed += 1;
      succeeded += 1;
      log({
        event: "record_succeeded",
        organizationId: record.organizationId,
        remaining: calculateRemaining(completed, records.length),
        sourceId: record.sourceId,
        sourceType: record.sourceType,
      });
    } catch (error) {
      completed += 1;
      failed += 1;
      log({
        error: error instanceof Error ? error.message : String(error),
        event: "record_failed",
        organizationId: record.organizationId,
        remaining: calculateRemaining(completed, records.length),
        sourceId: record.sourceId,
        sourceType: record.sourceType,
      });
    }
  };

  const worker = async (): Promise<void> => {
    while (nextIndex < records.length) {
      const index = nextIndex;
      nextIndex += 1;
      const record = records[index];
      if (!record) {
        continue;
      }
      await processRecord(record, index);
    }
  };

  const workerCount = Math.min(concurrency, records.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    failed,
    succeeded,
    total: records.length,
  };
}

function notAlreadyIndexedCondition(
  sourceType: SemanticBackfillRecord["sourceType"],
  sourceIdColumn: typeof studioInterview.id | typeof resumePoolItem.id,
) {
  return notExists(
    sql`(
      select 1
      from ${resumeSemanticIndex}
      where ${resumeSemanticIndex.sourceType} = ${sourceType}
        and ${resumeSemanticIndex.sourceId} = ${sourceIdColumn}
        and ${resumeSemanticIndex.embeddingVersion} = ${process.env.RESUME_EMBEDDING_VERSION || "dashscope-text-embedding-v4-1024-v1"}
        and ${resumeSemanticIndex.status} = 'indexed'
    )`,
  );
}

async function loadStudioRecords(db: Database): Promise<SemanticBackfillRecord[]> {
  const rows = await db
    .select({
      organizationId: studioInterview.organizationId,
      sourceId: studioInterview.id,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.resumeParseStatus, "ready"),
        isNotNull(studioInterview.resumeProfile),
        notAlreadyIndexedCondition("studio_interview", studioInterview.id),
      ),
    )
    .orderBy(asc(studioInterview.createdAt));

  return rows.map((row) => ({
    organizationId: row.organizationId,
    sourceId: row.sourceId,
    sourceType: "studio_interview",
  }));
}

async function loadPoolRecords(
  db: Database,
  scope?: SemanticBackfillPoolScope,
): Promise<SemanticBackfillRecord[]> {
  const where = and(
    eq(resumePoolItem.resumeParseStatus, "ready"),
    isNotNull(resumePoolItem.organizationId),
    isNotNull(resumePoolItem.resumeProfile),
    notAlreadyIndexedCondition("resume_pool_item", resumePoolItem.id),
    scope ? eq(resumePoolItem.scope, scope) : undefined,
  );
  const rows = await db
    .select({
      organizationId: resumePoolItem.organizationId,
      sourceId: resumePoolItem.id,
    })
    .from(resumePoolItem)
    .where(where)
    .orderBy(asc(resumePoolItem.createdAt));

  return rows
    .filter((row): row is typeof row & { organizationId: string } => Boolean(row.organizationId))
    .map((row) => ({
      organizationId: row.organizationId,
      sourceId: row.sourceId,
      sourceType: "resume_pool_item",
    }));
}

async function loadSemanticBackfillRecords(
  db: Database,
  target: SemanticBackfillTarget,
  limit: number | null,
): Promise<SemanticBackfillRecord[]> {
  if (target === "studio") {
    const records = await loadStudioRecords(db);
    return limit ? records.slice(0, limit) : records;
  }
  if (target === "pool") {
    const records = await loadPoolRecords(db);
    return limit ? records.slice(0, limit) : records;
  }
  const poolScope = resolveSemanticBackfillPoolScope(target);
  if (poolScope) {
    const records = await loadPoolRecords(db, poolScope);
    return limit ? records.slice(0, limit) : records;
  }

  const records = [...(await loadStudioRecords(db)), ...(await loadPoolRecords(db))];
  return limit ? records.slice(0, limit) : records;
}

async function countCurrentSemanticIndexRows(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(resumeSemanticIndex);
  return row?.value ?? 0;
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
  const appsRoot = path.resolve(import.meta.dirname, "../../..");
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env.local"), quiet: true });
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env"), quiet: true });
}

export async function backfillResumeSemanticIndex({
  defaultTarget = "all",
}: ResumeSemanticBackfillCliOptions = {}): Promise<void> {
  loadScriptEnv();
  const [{ closeDatabase, db }, { runResumeSemanticIndexJob }] = await Promise.all([
    import("@arc/ai-recruitment-copilot-backend/lib/server/db"),
    import("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer"),
  ]);
  const target = resolveSemanticBackfillTarget({
    defaultTarget,
    rawTarget: process.env.BACKFILL_RESUME_SEMANTIC_TARGET,
  });
  const concurrency = parseSemanticBackfillConcurrency(
    process.env.BACKFILL_RESUME_SEMANTIC_CONCURRENCY,
  );
  const limit = parseOptionalPositiveInteger(
    process.env.BACKFILL_RESUME_SEMANTIC_LIMIT,
    "BACKFILL_RESUME_SEMANTIC_LIMIT",
  );

  try {
    const records = await loadSemanticBackfillRecords(db, target, limit);
    logEvent({
      concurrency,
      event: "backfill_started",
      limit,
      recordCount: records.length,
      semanticIndexRowsBefore: await countCurrentSemanticIndexRows(db),
      target,
    });

    const summary = await runResumeSemanticBackfillRecords({
      concurrency,
      indexRecord: runResumeSemanticIndexJob,
      log: logEvent,
      records,
    });

    logEvent({
      event: "backfill_finished",
      ...summary,
      semanticIndexRowsAfter: await countCurrentSemanticIndexRows(db),
    });
  } finally {
    await closeDatabase();
  }
}

export async function runResumeSemanticBackfillCli(
  options: ResumeSemanticBackfillCliOptions = {},
): Promise<void> {
  try {
    await backfillResumeSemanticIndex(options);
  } catch (error) {
    logEvent({
      error: error instanceof Error ? error.message : String(error),
      event: "backfill_crashed",
    });
    process.exitCode = 1;
  }
}

function isDirectRun(): boolean {
  const [, entry] = process.argv;
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  await runResumeSemanticBackfillCli();
}
