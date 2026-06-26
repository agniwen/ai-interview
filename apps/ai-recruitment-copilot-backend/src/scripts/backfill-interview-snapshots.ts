import path from "node:path";
import { pathToFileURL } from "node:url";
import { asc, and, eq, isNotNull, notExists, sql } from "drizzle-orm";
import { config as loadEnvFile } from "dotenv";
import {
  interviewContextSnapshot,
  interviewConversation,
  interviewEvidenceSnapshot,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import type { Database } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { loadStandaloneEnv } from "../standalone/env";

export type InterviewSnapshotBackfillTarget = "all" | "context" | "evidence";

export interface ContextSnapshotBackfillRecord {
  createdBy: string | null;
  interviewRecordId: string;
  recordType: "context_snapshot";
  scheduleEntryId: string | null;
}

export interface EvidenceSnapshotBackfillRecord {
  conversationId: string;
  interviewRecordId: string;
  recordType: "evidence_snapshot";
}

export type InterviewSnapshotBackfillRecord =
  | ContextSnapshotBackfillRecord
  | EvidenceSnapshotBackfillRecord;

interface InterviewSnapshotBackfillLog {
  [key: string]: unknown;
  event: string;
}

interface RunInterviewSnapshotBackfillInput {
  backfillContext: (record: ContextSnapshotBackfillRecord) => Promise<void>;
  backfillEvidence: (record: EvidenceSnapshotBackfillRecord) => Promise<void>;
  dryRun: boolean;
  log: (entry: InterviewSnapshotBackfillLog) => void;
  records: InterviewSnapshotBackfillRecord[];
}

interface InterviewSnapshotBackfillSummary {
  failed: number;
  succeeded: number;
  total: number;
}

export function parseInterviewSnapshotBackfillTarget(
  value?: string,
): InterviewSnapshotBackfillTarget {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "all";
  }
  if (normalized === "all") {
    return "all";
  }
  if (normalized === "context" || normalized === "contexts") {
    return "context";
  }
  if (normalized === "evidence" || normalized === "evidences") {
    return "evidence";
  }
  throw new Error("BACKFILL_INTERVIEW_SNAPSHOTS_TARGET must be one of: all, context, evidence.");
}

export function parseInterviewSnapshotBackfillDryRun(value?: string): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function serializeInterviewSnapshotBackfillLog(log: InterviewSnapshotBackfillLog): string {
  return JSON.stringify(log);
}

function logEvent(log: InterviewSnapshotBackfillLog): void {
  console.log(
    serializeInterviewSnapshotBackfillLog({ timestamp: new Date().toISOString(), ...log }),
  );
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

function logContextForRecord(record: InterviewSnapshotBackfillRecord): Record<string, unknown> {
  if (record.recordType === "context_snapshot") {
    return {
      interviewRecordId: record.interviewRecordId,
      recordType: record.recordType,
      scheduleEntryId: record.scheduleEntryId,
    };
  }
  return {
    conversationId: record.conversationId,
    interviewRecordId: record.interviewRecordId,
    recordType: record.recordType,
  };
}

export async function runInterviewSnapshotBackfillRecords({
  backfillContext,
  backfillEvidence,
  dryRun,
  log,
  records,
}: RunInterviewSnapshotBackfillInput): Promise<InterviewSnapshotBackfillSummary> {
  let completed = 0;
  let failed = 0;
  let succeeded = 0;

  for (const [index, record] of records.entries()) {
    log({
      event: "record_started",
      index: index + 1,
      recordCount: records.length,
      ...logContextForRecord(record),
    });

    try {
      if (!dryRun) {
        await (record.recordType === "context_snapshot"
          ? backfillContext(record)
          : backfillEvidence(record));
      }
      completed += 1;
      succeeded += 1;
      log({
        event: "record_succeeded",
        remaining: calculateRemaining(completed, records.length),
        ...logContextForRecord(record),
      });
    } catch (error) {
      completed += 1;
      failed += 1;
      log({
        error: error instanceof Error ? error.message : String(error),
        event: "record_failed",
        remaining: calculateRemaining(completed, records.length),
        ...logContextForRecord(record),
      });
    }
  }

  return {
    failed,
    succeeded,
    total: records.length,
  };
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
  const appsRoot = path.resolve(import.meta.dirname, "../../..");
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env.local"), quiet: true });
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env"), quiet: true });
}

async function loadFirstScheduleEntryId(
  db: Database,
  interviewRecordId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: studioInterviewSchedule.id })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, interviewRecordId))
    .orderBy(asc(studioInterviewSchedule.sortOrder), asc(studioInterviewSchedule.createdAt))
    .limit(1);
  return row?.id ?? null;
}

async function loadContextBackfillRecords(
  db: Database,
  limit: number | null,
): Promise<ContextSnapshotBackfillRecord[]> {
  const query = db
    .select({
      createdBy: studioInterview.createdBy,
      interviewRecordId: studioInterview.id,
    })
    .from(studioInterview)
    .where(
      notExists(
        sql`(
          select 1
          from ${interviewContextSnapshot}
          where ${interviewContextSnapshot.interviewRecordId} = ${studioInterview.id}
            and ${interviewContextSnapshot.status} = 'active'
        )`,
      ),
    )
    .orderBy(asc(studioInterview.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  const records: ContextSnapshotBackfillRecord[] = [];

  for (const row of rows) {
    records.push({
      createdBy: row.createdBy,
      interviewRecordId: row.interviewRecordId,
      recordType: "context_snapshot",
      scheduleEntryId: await loadFirstScheduleEntryId(db, row.interviewRecordId),
    });
  }

  return records;
}

async function loadEvidenceBackfillRecords(
  db: Database,
  limit: number | null,
): Promise<EvidenceSnapshotBackfillRecord[]> {
  const query = db
    .select({
      conversationId: interviewConversation.conversationId,
      interviewRecordId: interviewConversation.interviewRecordId,
    })
    .from(interviewConversation)
    .where(
      and(
        isNotNull(interviewConversation.interviewRecordId),
        notExists(
          sql`(
            select 1
            from ${interviewEvidenceSnapshot}
            where ${interviewEvidenceSnapshot.conversationId} = ${interviewConversation.conversationId}
          )`,
        ),
      ),
    )
    .orderBy(asc(interviewConversation.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  return rows.flatMap((row) =>
    row.interviewRecordId
      ? [
          {
            conversationId: row.conversationId,
            interviewRecordId: row.interviewRecordId,
            recordType: "evidence_snapshot" as const,
          },
        ]
      : [],
  );
}

async function loadInterviewSnapshotBackfillRecords(
  db: Database,
  target: InterviewSnapshotBackfillTarget,
  limit: number | null,
): Promise<InterviewSnapshotBackfillRecord[]> {
  const records: InterviewSnapshotBackfillRecord[] = [];
  if (target === "all" || target === "context") {
    records.push(...(await loadContextBackfillRecords(db, limit)));
  }
  if (target === "all" || target === "evidence") {
    records.push(...(await loadEvidenceBackfillRecords(db, limit)));
  }
  return records;
}

export async function backfillInterviewSnapshots(): Promise<void> {
  loadScriptEnv();
  const { closeDatabase, db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
  const { createInterviewEvidenceSnapshot } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot");
  const { createInterviewContextSnapshot } =
    await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots");
  const target = parseInterviewSnapshotBackfillTarget(
    process.env.BACKFILL_INTERVIEW_SNAPSHOTS_TARGET,
  );
  const dryRun = parseInterviewSnapshotBackfillDryRun(
    process.env.BACKFILL_INTERVIEW_SNAPSHOTS_DRY_RUN,
  );
  const limit = parseOptionalPositiveInteger(
    process.env.BACKFILL_INTERVIEW_SNAPSHOTS_LIMIT,
    "BACKFILL_INTERVIEW_SNAPSHOTS_LIMIT",
  );

  try {
    const records = await loadInterviewSnapshotBackfillRecords(db, target, limit);
    logEvent({
      dryRun,
      event: "backfill_started",
      limit,
      recordCount: records.length,
      target,
    });
    const summary = await runInterviewSnapshotBackfillRecords({
      backfillContext: async (record) => {
        await db.transaction((tx) =>
          createInterviewContextSnapshot(tx, {
            createdBy: record.createdBy,
            interviewRecordId: record.interviewRecordId,
            reason: "create",
            scheduleEntryId: record.scheduleEntryId,
          }),
        );
      },
      backfillEvidence: async (record) => {
        await createInterviewEvidenceSnapshot({
          conversationId: record.conversationId,
          interviewRecordId: record.interviewRecordId,
        });
      },
      dryRun,
      log: logEvent,
      records,
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
    await backfillInterviewSnapshots();
  } catch (error) {
    logEvent({
      error: error instanceof Error ? error.message : String(error),
      event: "backfill_crashed",
    });
    process.exitCode = 1;
  }
}
