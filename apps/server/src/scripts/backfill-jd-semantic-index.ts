import { pathToFileURL } from "node:url";
import { and, asc, count, eq, notExists, sql } from "drizzle-orm";
import { jobDescription, resumeSemanticIndex } from "@arc/db-schema/schema";
import type { JsonValue } from "@arc/db-schema/json";
import type { Database } from "../lib/server/db/index";
import type { JdSemanticIndexJob } from "../lib/server/jd-semantic/indexer";
import { loadStandaloneEnv } from "../standalone/env";

type SemanticBackfillTarget = "all";
type SemanticBackfillRecord = JdSemanticIndexJob;

interface SemanticBackfillLog {
  [key: string]: JsonValue | undefined;
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

interface JdSemanticBackfillCliOptions {
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
    throw new Error("BACKFILL_JD_SEMANTIC_CONCURRENCY must be a positive integer.");
  }
  return parsed;
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

export async function runJdSemanticBackfillRecords({
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
  sourceIdColumn: typeof jobDescription.id,
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

async function loadJdRecords(db: Database): Promise<SemanticBackfillRecord[]> {
  const rows = await db
    .select({
      organizationId: jobDescription.organizationId,
      sourceId: jobDescription.id,
    })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.lifecycleStatus, "published"),
        notAlreadyIndexedCondition("job_description", jobDescription.id),
      ),
    )
    .orderBy(asc(jobDescription.createdAt));

  return rows.map((row) => ({
    organizationId: row.organizationId,
    sourceId: row.sourceId,
    sourceType: "job_description" as const,
  }));
}

async function loadSemanticBackfillRecords(
  db: Database,
  limit: number | null,
): Promise<SemanticBackfillRecord[]> {
  const records = await loadJdRecords(db);
  return limit ? records.slice(0, limit) : records;
}

async function countCurrentSemanticIndexRows(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(resumeSemanticIndex);
  return row?.value ?? 0;
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
}

export async function backfillJdSemanticIndex({
  defaultTarget = "all",
}: JdSemanticBackfillCliOptions = {}): Promise<void> {
  loadScriptEnv();
  const [{ closeDatabase, db }, { runJdSemanticIndexJob }] = await Promise.all([
    import("../lib/server/db/index"),
    import("../lib/server/jd-semantic/indexer"),
  ]);
  const target: SemanticBackfillTarget = defaultTarget;
  const concurrency = parseSemanticBackfillConcurrency(
    process.env.BACKFILL_JD_SEMANTIC_CONCURRENCY,
  );
  const limit = parseOptionalPositiveInteger(
    process.env.BACKFILL_JD_SEMANTIC_LIMIT,
    "BACKFILL_JD_SEMANTIC_LIMIT",
  );

  try {
    const records = await loadSemanticBackfillRecords(db, limit);
    logEvent({
      concurrency,
      event: "backfill_started",
      limit,
      recordCount: records.length,
      semanticIndexRowsBefore: await countCurrentSemanticIndexRows(db),
      target,
    });

    const summary = await runJdSemanticBackfillRecords({
      concurrency,
      indexRecord: runJdSemanticIndexJob,
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

export async function runJdSemanticBackfillCli(
  options: JdSemanticBackfillCliOptions = {},
): Promise<void> {
  try {
    await backfillJdSemanticIndex(options);
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
  await runJdSemanticBackfillCli();
}
