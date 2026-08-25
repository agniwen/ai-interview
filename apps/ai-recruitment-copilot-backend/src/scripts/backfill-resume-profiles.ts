import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { config as loadEnvFile } from "dotenv";
import { z } from "zod";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import type { JsonValue } from "@arc/db-schema/json";
import {
  chatAttachment,
  resumeEvaluationVersion,
  resumePoolItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { Database } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { INVALIDATED_AI_RESUME_ASSESSMENT } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-assessment-invalidation";
import { buildPreQualitativeEvaluationArchive } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-evaluation-history";
import { loadStandaloneEnv } from "../standalone/env";

type BackfillTarget = "all" | "pool" | "private";
type BackfillRecordType = "pool" | "private";
type ResumeEducationExperience = NonNullable<ResumeProfile["educationExperiences"]>[number];
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface BackfillRecord {
  contentHash: string | null;
  fileName: string;
  id: string;
  organizationId: string;
  recordType: BackfillRecordType;
  resumeProfile: ResumeProfile | null;
  storageKey: string;
}

interface EducationBackfillResult {
  educationExperiences: ResumeEducationExperience[];
  pageCount: number | null;
  text: string | null;
  textSource: AttachmentTextSource | null;
}

interface ResumeBackfillLog {
  [key: string]: JsonValue | undefined;
  event: string;
}

const STRUCTURED_TEXT_MAX_CHARS = 16_000;
const DEFAULT_BACKFILL_CONCURRENCY = 6;

const educationExperienceSchema = z.object({
  degree: z.string().nullable(),
  educationLevel: z.string().nullable(),
  graduationYear: z.string().nullable(),
  major: z.string().nullable(),
  period: z.string().nullable(),
  school: z.string().nullable(),
  summary: z.string().nullable(),
});

const educationBackfillSchema = z.object({
  educationExperiences: z.array(educationExperienceSchema).default([]),
});

const EDUCATION_BACKFILL_INSTRUCTIONS = `你是一名简历教育经历解析助手。给你一段简历文本，只提取教育经历，不要分析或输出其他候选人信息。

## 输出 JSON 结构（字段名与类型必须严格匹配）

{
  "educationExperiences": [
    { "school": string | null, "degree": string | null, "major": string | null, "period": string | null, "graduationYear": string | null, "educationLevel": string | null, "summary": string | null }
  ]
}

## 输出约束
- 只输出 JSON 本身，不要任何额外解释文字，不要使用 Markdown 代码块。
- 按简历原文顺序输出所有教育经历。
- 每段尽量提取 school / degree / major / period / graduationYear / educationLevel / summary。
- 如果教育经历只有学校名，也要输出一条记录，其余无法确认字段为 null。
- educationLevel 是学历层次，如专科、本科、硕士、博士；degree 是学位，如学士、硕士、博士。
- 无法从简历中确认的字段返回 null，禁止编造。
- 如果完全没有教育经历，返回空数组。`;

export function parseBackfillTarget(value?: string): BackfillTarget {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "all";
  }
  if (normalized === "all" || normalized === "private" || normalized === "pool") {
    return normalized;
  }
  throw new Error("BACKFILL_RESUME_PROFILE_TARGET must be one of: all, private, pool.");
}

export function parseBackfillConcurrency(value?: string): number {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_BACKFILL_CONCURRENCY;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKFILL_RESUME_PROFILE_CONCURRENCY must be a positive integer.");
  }
  return parsed;
}

export function calculateRemainingRecords(input: { completed: number; total: number }): number {
  return Math.max(input.total - input.completed, 0);
}

function cleanText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function normalizeEducationExperiences(
  educationExperiences: ResumeEducationExperience[],
): ResumeEducationExperience[] {
  return educationExperiences.map((education) => ({
    degree: cleanText(education.degree),
    educationLevel: cleanText(education.educationLevel),
    graduationYear: cleanText(education.graduationYear),
    major: cleanText(education.major),
    period: cleanText(education.period),
    school: cleanText(education.school),
    summary: cleanText(education.summary),
  }));
}

export function mergeEducationExperiencesIntoProfile(
  profile: ResumeProfile,
  educationExperiences: ResumeEducationExperience[],
): ResumeProfile {
  return {
    ...profile,
    educationExperiences,
  };
}

export function hasExistingEducationExperiences(profile: ResumeProfile | null): boolean {
  return Array.isArray(profile?.educationExperiences) && profile.educationExperiences.length > 0;
}

export function serializeResumeBackfillLog(log: ResumeBackfillLog): string {
  return JSON.stringify(log);
}

function logEvent(log: ResumeBackfillLog): void {
  console.log(serializeResumeBackfillLog({ timestamp: new Date().toISOString(), ...log }));
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

function clipForStructured(text: string): string {
  if (text.length <= STRUCTURED_TEXT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, STRUCTURED_TEXT_MAX_CHARS)}\n\n[...content truncated...]`;
}

function loadScriptEnv(): void {
  loadStandaloneEnv();
  const appsRoot = path.resolve(import.meta.dirname, "../../..");
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env.local"), quiet: true });
  loadEnvFile({ path: path.join(appsRoot, "ai-recruitment-copilot", ".env"), quiet: true });
}

async function loadPrivateRecords(db: Database, limit: number | null): Promise<BackfillRecord[]> {
  const query = db
    .select({
      contentHash: studioInterview.resumeContentHash,
      fileName: studioInterview.resumeFileName,
      id: studioInterview.id,
      organizationId: studioInterview.organizationId,
      resumeProfile: studioInterview.resumeProfile,
      storageKey: studioInterview.resumeStorageKey,
    })
    .from(studioInterview)
    .where(isNotNull(studioInterview.resumeStorageKey))
    .orderBy(asc(studioInterview.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  return rows
    .filter((row): row is typeof row & { storageKey: string } => Boolean(row.storageKey))
    .map((row) => ({
      contentHash: row.contentHash,
      fileName: row.fileName || `${row.id}.pdf`,
      id: row.id,
      organizationId: row.organizationId,
      recordType: "private",
      resumeProfile: row.resumeProfile,
      storageKey: row.storageKey,
    }));
}

async function loadPoolRecords(db: Database, limit: number | null): Promise<BackfillRecord[]> {
  const query = db
    .select({
      contentHash: resumePoolItem.resumeContentHash,
      fileName: resumePoolItem.resumeFileName,
      id: resumePoolItem.id,
      organizationId: resumePoolItem.organizationId,
      resumeProfile: resumePoolItem.resumeProfile,
      storageKey: resumePoolItem.resumeStorageKey,
    })
    .from(resumePoolItem)
    .where(isNotNull(resumePoolItem.resumeStorageKey))
    .orderBy(asc(resumePoolItem.createdAt));

  const rows = limit ? await query.limit(limit) : await query;
  return rows
    .filter((row): row is typeof row & { organizationId: string; storageKey: string } =>
      Boolean(row.organizationId && row.storageKey),
    )
    .map((row) => ({
      contentHash: row.contentHash,
      fileName: row.fileName || `${row.id}.pdf`,
      id: row.id,
      organizationId: row.organizationId,
      recordType: "pool",
      resumeProfile: row.resumeProfile,
      storageKey: row.storageKey,
    }));
}

async function loadBackfillRecords(
  db: Database,
  target: BackfillTarget,
  limit: number | null,
): Promise<BackfillRecord[]> {
  if (target === "private") {
    return loadPrivateRecords(db, limit);
  }
  if (target === "pool") {
    return loadPoolRecords(db, limit);
  }
  const [privateRecords, poolRecords] = await Promise.all([
    loadPrivateRecords(db, null),
    loadPoolRecords(db, null),
  ]);
  return limit
    ? [...privateRecords, ...poolRecords].slice(0, limit)
    : [...privateRecords, ...poolRecords];
}

async function findCachedParsedText(db: Database, record: BackfillRecord) {
  const storageKeyMatch = eq(chatAttachment.storageKey, record.storageKey);
  const lookupCondition = record.contentHash
    ? or(storageKeyMatch, eq(chatAttachment.contentHash, record.contentHash))
    : storageKeyMatch;

  const [row] = await db
    .select({
      pageCount: chatAttachment.parsedPageCount,
      text: chatAttachment.parsedText,
      textSource: chatAttachment.parsedTextSource,
    })
    .from(chatAttachment)
    .where(and(lookupCondition, isNotNull(chatAttachment.parsedText)))
    .orderBy(desc(chatAttachment.parsedAt), desc(chatAttachment.createdAt))
    .limit(1);

  return row?.text ? row : null;
}

async function generateEducationExperiences(text: string): Promise<ResumeEducationExperience[]> {
  const { generateStructuredWithMastraAgent, resumeEducationBackfillAgent } =
    await import("@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators");
  const parsed = await generateStructuredWithMastraAgent({
    agent: resumeEducationBackfillAgent,
    maxOutputTokens: 4096,
    prompt: `${EDUCATION_BACKFILL_INSTRUCTIONS}\n\n简历文本：\n${clipForStructured(text)}`,
    schema: educationBackfillSchema,
    temperature: 0,
  });
  return normalizeEducationExperiences(parsed.educationExperiences);
}

async function extractEducationForRecord(
  db: Database,
  record: BackfillRecord,
  forceOcr: boolean,
): Promise<EducationBackfillResult> {
  const cached = forceOcr ? null : await findCachedParsedText(db, record);
  if (cached?.text) {
    return {
      educationExperiences: await generateEducationExperiences(cached.text),
      pageCount: cached.pageCount,
      text: cached.text,
      textSource: cached.textSource,
    };
  }

  const [{ extractResumeDocumentText }, { getObjectBytes }] = await Promise.all([
    import("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline"),
    import("@arc/ai-recruitment-copilot-backend/lib/server/s3"),
  ]);
  const object = await getObjectBytes(record.storageKey);
  if (!object) {
    throw new Error(`Resume object not found in storage: ${record.storageKey}`);
  }

  const extracted = await extractResumeDocumentText({
    bytes: object.bytes,
    fileName: record.fileName,
    mediaType: object.contentType,
  });

  return {
    educationExperiences: await generateEducationExperiences(extracted.text),
    pageCount: extracted.pageCount,
    text: extracted.text,
    textSource: extracted.textSource,
  };
}

async function updateRelatedAttachmentCache(
  tx: Tx,
  record: BackfillRecord,
  parsed: EducationBackfillResult,
): Promise<void> {
  const now = new Date();
  const educationJson = JSON.stringify(parsed.educationExperiences);
  const condition = record.contentHash
    ? eq(chatAttachment.contentHash, record.contentHash)
    : eq(chatAttachment.storageKey, record.storageKey);
  const values = {
    parsedAt: now,
    parsedError: null,
    parsedPageCount: parsed.pageCount,
    parsedStructured: sql`jsonb_set(${chatAttachment.parsedStructured}, '{educationExperiences}', ${educationJson}::jsonb, true)`,
    parsedText: parsed.text,
    parsedTextSource: parsed.textSource,
  };

  await tx
    .update(chatAttachment)
    .set(values)
    .where(and(condition, isNotNull(chatAttachment.parsedStructured)));
}

async function writeBackfillResult(
  db: Database,
  record: BackfillRecord,
  parsed: EducationBackfillResult,
): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await updateRelatedAttachmentCache(tx, record, parsed);

    if (record.recordType === "private") {
      const [current] = await tx
        .select({
          notes: studioInterview.notes,
          organizationId: studioInterview.organizationId,
          qualitativeJobDescriptionVersionId: studioInterview.qualitativeJobDescriptionVersionId,
          qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
          resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
          resumeProfile: studioInterview.resumeProfile,
          resumeReview: studioInterview.resumeReview,
          resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
          structuredCompositeScore: studioInterview.structuredCompositeScore,
          structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
        })
        .from(studioInterview)
        .where(eq(studioInterview.id, record.id))
        .limit(1)
        .for("update");
      if (!current?.resumeProfile) {
        throw new Error("Existing resumeProfile is empty; education-only backfill cannot merge.");
      }
      const archive = buildPreQualitativeEvaluationArchive({
        organizationId: current.organizationId,
        record: current,
        resumeRecordId: record.id,
      });
      if (archive) {
        await tx.insert(resumeEvaluationVersion).values(archive).onConflictDoNothing();
      }
      await tx
        .update(studioInterview)
        .set({
          ...INVALIDATED_AI_RESUME_ASSESSMENT,
          resumeParseError: null,
          resumeParsedAt: now,
          resumeProfile: mergeEducationExperiencesIntoProfile(
            current.resumeProfile,
            parsed.educationExperiences,
          ),
          updatedAt: now,
        })
        .where(eq(studioInterview.id, record.id));
      return;
    }

    const [current] = await tx
      .select({ resumeProfile: resumePoolItem.resumeProfile })
      .from(resumePoolItem)
      .where(eq(resumePoolItem.id, record.id))
      .limit(1);
    if (!current?.resumeProfile) {
      throw new Error("Existing resumeProfile is empty; education-only backfill cannot merge.");
    }
    await tx
      .update(resumePoolItem)
      .set({
        resumeParseError: null,
        resumeParsedAt: now,
        resumeProfile: mergeEducationExperiencesIntoProfile(
          current.resumeProfile,
          parsed.educationExperiences,
        ),
        updatedAt: now,
      })
      .where(eq(resumePoolItem.id, record.id));
  });
}

async function backfillResumeProfiles(): Promise<void> {
  loadScriptEnv();
  const { closeDatabase, db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
  const target = parseBackfillTarget(process.env.BACKFILL_RESUME_PROFILE_TARGET);
  const concurrency = parseBackfillConcurrency(process.env.BACKFILL_RESUME_PROFILE_CONCURRENCY);
  const limit = parseOptionalPositiveInteger(
    process.env.BACKFILL_RESUME_PROFILE_LIMIT,
    "BACKFILL_RESUME_PROFILE_LIMIT",
  );
  const forceOcr = parseBooleanEnv(process.env.BACKFILL_RESUME_PROFILE_FORCE_OCR);

  try {
    const records = await loadBackfillRecords(db, target, limit);
    let failed = 0;
    let skipped = 0;
    let succeeded = 0;
    logEvent({
      concurrency,
      event: "backfill_started",
      forceOcr,
      limit,
      recordCount: records.length,
      target,
    });

    let nextIndex = 0;
    let completed = 0;
    const processRecord = async (record: BackfillRecord, index: number): Promise<void> => {
      logEvent({
        contentHash: record.contentHash,
        event: "record_started",
        index: index + 1,
        recordCount: records.length,
        recordId: record.id,
        recordType: record.recordType,
        storageKey: record.storageKey,
      });

      if (hasExistingEducationExperiences(record.resumeProfile)) {
        skipped += 1;
        completed += 1;
        logEvent({
          event: "record_skipped",
          reason: "educationExperiences already exists",
          recordId: record.id,
          recordType: record.recordType,
          remaining: calculateRemainingRecords({ completed, total: records.length }),
        });
        return;
      }

      try {
        const parsed = await extractEducationForRecord(db, record, forceOcr);
        await writeBackfillResult(db, record, parsed);
        succeeded += 1;
        completed += 1;
        logEvent({
          educationExperiences: parsed.educationExperiences,
          event: "record_succeeded",
          pageCount: parsed.pageCount,
          recordId: record.id,
          recordType: record.recordType,
          remaining: calculateRemainingRecords({ completed, total: records.length }),
          textSource: parsed.textSource,
        });
      } catch (error) {
        failed += 1;
        completed += 1;
        logEvent({
          error: error instanceof Error ? error.message : String(error),
          event: "record_failed",
          recordId: record.id,
          recordType: record.recordType,
          remaining: calculateRemainingRecords({ completed, total: records.length }),
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

    logEvent({
      event: "backfill_finished",
      failed,
      skipped,
      succeeded,
      total: records.length,
    });
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
    await backfillResumeProfiles();
  } catch (error) {
    logEvent({
      error: error instanceof Error ? error.message : String(error),
      event: "backfill_crashed",
    });
    process.exitCode = 1;
  }
}
