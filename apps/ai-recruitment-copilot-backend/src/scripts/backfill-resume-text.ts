import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, asc, desc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { config as loadEnvFile } from "dotenv";
import {
  chatAttachment,
  resumeEvaluationVersion,
  resumePoolItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { JsonValue } from "@arc/db-schema/json";
import type { Database } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { INVALIDATED_AI_RESUME_ASSESSMENT } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-assessment-invalidation";
import { buildPreQualitativeEvaluationArchive } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-evaluation-history";
import { loadStandaloneEnv } from "../standalone/env";

export type ResumeTextBackfillTarget = "all" | "pool" | "private_pool" | "public_pool" | "studio";
export type ResumeTextBackfillRecordType = "resume_pool_item" | "studio_interview";

export interface ResumeTextBackfillRecord {
  contentHash: string | null;
  id: string;
  recordType: ResumeTextBackfillRecordType;
  storageKey: string | null;
}

interface ResumeTextBackfillLog {
  [key: string]: JsonValue | undefined;
  event: string;
}

interface ParsedAttachmentText {
  attachmentId: string;
  text: string;
}

interface RunResumeTextBackfillInput {
  concurrency: number;
  dryRun: boolean;
  findParsedText: (record: ResumeTextBackfillRecord) => Promise<ParsedAttachmentText | null>;
  log: (entry: ResumeTextBackfillLog) => void;
  records: ResumeTextBackfillRecord[];
  updateRecord: (record: ResumeTextBackfillRecord, resumeText: string) => Promise<void>;
}

interface ResumeTextBackfillSummary {
  failed: number;
  skipped: number;
  succeeded: number;
  total: number;
}

const DEFAULT_RESUME_TEXT_BACKFILL_CONCURRENCY = 6;

export function parseResumeTextBackfillTarget(value?: string): ResumeTextBackfillTarget {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "all";
  }
  if (normalized === "all" || normalized === "pool" || normalized === "studio") {
    return normalized;
  }
  if (normalized === "private" || normalized === "studio_interview") {
    return "studio";
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
  throw new Error(
    "BACKFILL_RESUME_TEXT_TARGET must be one of: all, studio, pool, public_pool, private_pool.",
  );
}

export function parseResumeTextBackfillConcurrency(value?: string): number {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_RESUME_TEXT_BACKFILL_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKFILL_RESUME_TEXT_CONCURRENCY must be a positive integer.");
  }
  return parsed;
}

export function calculateRemainingResumeTextRecords(input: {
  completed: number;
  total: number;
}): number {
  return Math.max(input.total - input.completed, 0);
}

export function serializeResumeTextBackfillLog(log: ResumeTextBackfillLog): string {
  return JSON.stringify(log);
}

function logEvent(log: ResumeTextBackfillLog): void {
  console.log(serializeResumeTextBackfillLog({ timestamp: new Date().toISOString(), ...log }));
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

function parseBooleanEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
  const appsRoot = path.resolve(import.meta.dirname, "../../..");
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env.local"), quiet: true });
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env"), quiet: true });
}

function resumeTextMissingCondition(column: typeof studioInterview.resumeText): SQL {
  return sql`(${column} is null or btrim(${column}) = '')`;
}

function poolResumeTextMissingCondition(): SQL {
  return sql`(${resumePoolItem.resumeText} is null or btrim(${resumePoolItem.resumeText}) = '')`;
}

async function loadStudioRecords(
  db: Database,
  limit: number | null,
): Promise<ResumeTextBackfillRecord[]> {
  const query = db
    .select({
      contentHash: studioInterview.resumeContentHash,
      id: studioInterview.id,
      storageKey: studioInterview.resumeStorageKey,
    })
    .from(studioInterview)
    .where(
      and(
        resumeTextMissingCondition(studioInterview.resumeText),
        or(
          isNotNull(studioInterview.resumeStorageKey),
          isNotNull(studioInterview.resumeContentHash),
        ),
      ),
    )
    .orderBy(asc(studioInterview.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((row) => ({
    contentHash: row.contentHash,
    id: row.id,
    recordType: "studio_interview",
    storageKey: row.storageKey,
  }));
}

async function loadPoolRecords(
  db: Database,
  target: ResumeTextBackfillTarget,
  limit: number | null,
): Promise<ResumeTextBackfillRecord[]> {
  let scopeCondition: SQL | undefined;
  if (target === "public_pool") {
    scopeCondition = eq(resumePoolItem.scope, "public");
  } else if (target === "private_pool") {
    scopeCondition = eq(resumePoolItem.scope, "private");
  }
  const query = db
    .select({
      contentHash: resumePoolItem.resumeContentHash,
      id: resumePoolItem.id,
      storageKey: resumePoolItem.resumeStorageKey,
    })
    .from(resumePoolItem)
    .where(
      and(
        poolResumeTextMissingCondition(),
        or(isNotNull(resumePoolItem.resumeStorageKey), isNotNull(resumePoolItem.resumeContentHash)),
        scopeCondition,
      ),
    )
    .orderBy(asc(resumePoolItem.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((row) => ({
    contentHash: row.contentHash,
    id: row.id,
    recordType: "resume_pool_item",
    storageKey: row.storageKey,
  }));
}

async function loadBackfillRecords(
  db: Database,
  target: ResumeTextBackfillTarget,
  limit: number | null,
): Promise<ResumeTextBackfillRecord[]> {
  if (target === "studio") {
    return loadStudioRecords(db, limit);
  }
  if (target === "pool" || target === "public_pool" || target === "private_pool") {
    return loadPoolRecords(db, target, limit);
  }
  const [studioRecords, poolRecords] = await Promise.all([
    loadStudioRecords(db, null),
    loadPoolRecords(db, "pool", null),
  ]);
  return limit
    ? [...studioRecords, ...poolRecords].slice(0, limit)
    : [...studioRecords, ...poolRecords];
}

async function findParsedAttachmentText(
  db: Database,
  record: ResumeTextBackfillRecord,
): Promise<ParsedAttachmentText | null> {
  const lookupConditions = [
    record.storageKey ? eq(chatAttachment.storageKey, record.storageKey) : null,
    record.contentHash ? eq(chatAttachment.contentHash, record.contentHash) : null,
  ].filter((condition): condition is SQL => condition !== null);
  if (lookupConditions.length === 0) {
    return null;
  }
  const lookupCondition =
    lookupConditions.length === 1 ? lookupConditions[0] : or(...lookupConditions);
  const storageKeyPriority = record.storageKey
    ? sql`case when ${chatAttachment.storageKey} = ${record.storageKey} then 0 else 1 end`
    : sql`0`;

  const [row] = await db
    .select({
      attachmentId: chatAttachment.id,
      text: chatAttachment.parsedText,
    })
    .from(chatAttachment)
    .where(
      and(
        lookupCondition,
        isNotNull(chatAttachment.parsedText),
        sql`btrim(${chatAttachment.parsedText}) <> ''`,
        ne(chatAttachment.parsedStatus, "failed"),
      ),
    )
    .orderBy(storageKeyPriority, desc(chatAttachment.parsedAt), desc(chatAttachment.createdAt))
    .limit(1);

  return row?.text ? { attachmentId: row.attachmentId, text: row.text } : null;
}

async function updateResumeText(
  db: Database,
  record: ResumeTextBackfillRecord,
  resumeText: string,
): Promise<void> {
  const now = new Date();
  if (record.recordType === "studio_interview") {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          notes: studioInterview.notes,
          organizationId: studioInterview.organizationId,
          qualitativeJobDescriptionVersionId: studioInterview.qualitativeJobDescriptionVersionId,
          qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
          resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
          resumeReview: studioInterview.resumeReview,
          resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
          structuredCompositeScore: studioInterview.structuredCompositeScore,
          structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
        })
        .from(studioInterview)
        .where(eq(studioInterview.id, record.id))
        .limit(1)
        .for("update");
      if (current) {
        const archive = buildPreQualitativeEvaluationArchive({
          organizationId: current.organizationId,
          record: current,
          resumeRecordId: record.id,
        });
        if (archive) {
          await tx.insert(resumeEvaluationVersion).values(archive).onConflictDoNothing();
        }
      }
      await tx
        .update(studioInterview)
        .set({
          ...INVALIDATED_AI_RESUME_ASSESSMENT,
          resumeText,
          updatedAt: now,
        })
        .where(
          and(
            eq(studioInterview.id, record.id),
            resumeTextMissingCondition(studioInterview.resumeText),
          ),
        );
    });
    return;
  }
  await db
    .update(resumePoolItem)
    .set({ resumeText, updatedAt: now })
    .where(and(eq(resumePoolItem.id, record.id), poolResumeTextMissingCondition()));
}

export async function runResumeTextBackfillRecords({
  concurrency,
  dryRun,
  findParsedText,
  log,
  records,
  updateRecord,
}: RunResumeTextBackfillInput): Promise<ResumeTextBackfillSummary> {
  let completed = 0;
  let failed = 0;
  let nextIndex = 0;
  let skipped = 0;
  let succeeded = 0;

  const processRecord = async (record: ResumeTextBackfillRecord, index: number): Promise<void> => {
    log({
      event: "record_started",
      index: index + 1,
      recordCount: records.length,
      recordId: record.id,
      recordType: record.recordType,
    });

    try {
      const parsed = await findParsedText(record);
      if (!parsed) {
        completed += 1;
        skipped += 1;
        log({
          event: "record_skipped",
          reason: "no parsed attachment text",
          recordId: record.id,
          recordType: record.recordType,
          remaining: calculateRemainingResumeTextRecords({ completed, total: records.length }),
        });
        return;
      }
      if (!dryRun) {
        await updateRecord(record, parsed.text);
      }
      completed += 1;
      succeeded += 1;
      log({
        attachmentId: parsed.attachmentId,
        dryRun,
        event: "record_succeeded",
        recordId: record.id,
        recordType: record.recordType,
        remaining: calculateRemainingResumeTextRecords({ completed, total: records.length }),
        textChars: parsed.text.length,
      });
    } catch (error) {
      completed += 1;
      failed += 1;
      log({
        error: error instanceof Error ? error.message : String(error),
        event: "record_failed",
        recordId: record.id,
        recordType: record.recordType,
        remaining: calculateRemainingResumeTextRecords({ completed, total: records.length }),
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
    skipped,
    succeeded,
    total: records.length,
  };
}

async function backfillResumeText(): Promise<void> {
  loadScriptEnv();
  const { closeDatabase, db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
  const target = parseResumeTextBackfillTarget(process.env.BACKFILL_RESUME_TEXT_TARGET);
  const concurrency = parseResumeTextBackfillConcurrency(
    process.env.BACKFILL_RESUME_TEXT_CONCURRENCY,
  );
  const limit = parseOptionalPositiveInteger(
    process.env.BACKFILL_RESUME_TEXT_LIMIT,
    "BACKFILL_RESUME_TEXT_LIMIT",
  );
  const dryRun = parseBooleanEnv(process.env.BACKFILL_RESUME_TEXT_DRY_RUN);

  try {
    const records = await loadBackfillRecords(db, target, limit);
    logEvent({
      concurrency,
      dryRun,
      event: "backfill_started",
      limit,
      recordCount: records.length,
      target,
    });
    const summary = await runResumeTextBackfillRecords({
      concurrency,
      dryRun,
      findParsedText: (record) => findParsedAttachmentText(db, record),
      log: logEvent,
      records,
      updateRecord: (record, resumeText) => updateResumeText(db, record, resumeText),
    });
    logEvent({ event: "backfill_finished", ...summary });
  } finally {
    await closeDatabase();
  }
}

function isDirectRun(): boolean {
  const [, entry] = process.argv;
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  try {
    await backfillResumeText();
  } catch (error) {
    logEvent({
      error: error instanceof Error ? error.message : String(error),
      event: "backfill_crashed",
    });
    process.exitCode = 1;
  }
}
