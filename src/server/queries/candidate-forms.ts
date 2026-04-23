import type {
  CandidateFormScope,
  CandidateFormSubmissionRecord,
  CandidateFormSubmissionWithSnapshot,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateQuestionRecord,
  CandidateFormTemplateRecord,
  CandidateFormTemplateSnapshot,
  CandidateFormTemplateVersionRecord,
} from "@/lib/candidate-forms";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateQuestion,
  candidateFormTemplateVersion,
  jobDescription,
  studioInterview,
} from "@/lib/db/schema";
import { buildTemplateSnapshot, hashTemplateSnapshot } from "@/lib/candidate-forms";

// =====================================================================
// Pagination + filters
// =====================================================================

const templateListFiltersSchema = z.object({
  jobDescriptionId: z.string().trim().max(120).optional().nullable(),
  scope: z.enum(["global", "job_description"]).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "title", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const templatePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SORT_COLUMNS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CandidateFormTemplatePaginationParams = z.infer<typeof templatePaginationSchema>;

export interface PaginatedCandidateFormTemplateResult {
  records: CandidateFormTemplateListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({
  search,
  scope,
  jobDescriptionId,
}: {
  search?: string;
  scope?: CandidateFormScope;
  jobDescriptionId?: string;
}) {
  const conditions = [] as (ReturnType<typeof ilike> | ReturnType<typeof eq>)[];
  if (search) {
    const searchCond = or(
      ilike(candidateFormTemplate.title, `%${search}%`),
      ilike(candidateFormTemplate.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (scope) {
    conditions.push(eq(candidateFormTemplate.scope, scope));
  }
  if (jobDescriptionId) {
    conditions.push(eq(candidateFormTemplate.jobDescriptionId, jobDescriptionId));
  }
  if (conditions.length === 0) {
    return;
  }
  return and(...conditions);
}

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: candidateFormTemplate.createdAt,
    title: candidateFormTemplate.title,
    updatedAt: candidateFormTemplate.updatedAt,
  } as const;
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// =====================================================================
// Row loaders (shared)
// =====================================================================

function listTemplateRows({
  search,
  scope,
  jobDescriptionId,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  scope?: CandidateFormScope;
  jobDescriptionId?: string;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ jobDescriptionId, scope, search });

  let query = db
    .select({
      createdAt: candidateFormTemplate.createdAt,
      createdBy: candidateFormTemplate.createdBy,
      description: candidateFormTemplate.description,
      id: candidateFormTemplate.id,
      jobDescriptionId: candidateFormTemplate.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      scope: candidateFormTemplate.scope,
      title: candidateFormTemplate.title,
      updatedAt: candidateFormTemplate.updatedAt,
    })
    .from(candidateFormTemplate)
    .leftJoin(jobDescription, eq(candidateFormTemplate.jobDescriptionId, jobDescription.id))
    .where(where)
    .orderBy(buildOrderBy(sortBy, sortOrder))
    .$dynamic();

  if (limit !== undefined) {
    query = query.limit(limit);
  }
  if (offset !== undefined) {
    query = query.offset(offset);
  }

  return query;
}

async function countTemplateRows({
  search,
  scope,
  jobDescriptionId,
}: {
  search?: string;
  scope?: CandidateFormScope;
  jobDescriptionId?: string;
}) {
  const where = buildWhereConditions({ jobDescriptionId, scope, search });
  const [result] = await db.select({ count: count() }).from(candidateFormTemplate).where(where);
  return result?.count ?? 0;
}

async function loadQuestionCountsByTemplate(templateIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      count: count(),
      templateId: candidateFormTemplateQuestion.templateId,
    })
    .from(candidateFormTemplateQuestion)
    .where(inArray(candidateFormTemplateQuestion.templateId, templateIds))
    .groupBy(candidateFormTemplateQuestion.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

async function loadSubmissionCountsByTemplate(templateIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      count: count(),
      templateId: candidateFormSubmission.templateId,
    })
    .from(candidateFormSubmission)
    .where(inArray(candidateFormSubmission.templateId, templateIds))
    .groupBy(candidateFormSubmission.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

function toListRecord(
  row: Awaited<ReturnType<typeof listTemplateRows>>[number],
  questionCount: number,
  submissionCount: number,
): CandidateFormTemplateListRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    questionCount,
    scope: row.scope,
    submissionCount,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}

function parseFilters(filters?: {
  search?: string | null;
  scope?: string | null;
  jobDescriptionId?: string | null;
}) {
  const parsed = templateListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return {
      jobDescriptionId: undefined,
      scope: undefined,
      search: undefined,
    };
  }
  return {
    jobDescriptionId: parsed.data.jobDescriptionId?.trim() || undefined,
    scope: (parsed.data.scope as CandidateFormScope | undefined) ?? undefined,
    search: parsed.data.search?.trim() || undefined,
  };
}

export function parseCandidateFormTemplatePagination(
  params?: Record<string, unknown>,
): CandidateFormTemplatePaginationParams {
  return templatePaginationSchema.parse(params ?? {});
}

// =====================================================================
// Public queries
// =====================================================================

export async function queryPaginatedCandidateFormTemplates(
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedCandidateFormTemplateResult> {
  const { search, scope, jobDescriptionId } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseCandidateFormTemplatePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listTemplateRows({
      jobDescriptionId,
      limit: pageSize,
      offset,
      scope,
      search,
      sortBy,
      sortOrder,
    }),
    countTemplateRows({ jobDescriptionId, scope, search }),
  ]);

  const ids = rows.map((row) => row.id);
  const [questionCounts, submissionCounts] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadSubmissionCountsByTemplate(ids),
  ]);

  return {
    page,
    pageSize,
    records: rows.map((row) =>
      toListRecord(row, questionCounts.get(row.id) ?? 0, submissionCounts.get(row.id) ?? 0),
    ),
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listCandidateFormTemplates(
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag("candidate-form-templates");
  cacheLife("minutes");

  return queryPaginatedCandidateFormTemplates(filters, pagination);
}

// oxlint-disable-next-line require-await
export async function listAllCandidateFormTemplates(): Promise<CandidateFormTemplateListRecord[]> {
  "use cache";
  cacheTag("candidate-form-templates");
  cacheLife("minutes");

  const rows = await listTemplateRows({ sortBy: "title", sortOrder: "asc" });
  const ids = rows.map((row) => row.id);
  const [questionCounts, submissionCounts] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadSubmissionCountsByTemplate(ids),
  ]);
  return rows.map((row) =>
    toListRecord(row, questionCounts.get(row.id) ?? 0, submissionCounts.get(row.id) ?? 0),
  );
}

function mapQuestionRow(
  row: typeof candidateFormTemplateQuestion.$inferSelect,
): CandidateFormTemplateQuestionRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    displayMode: row.displayMode,
    helperText: row.helperText,
    id: row.id,
    label: row.label,
    options: row.options ?? [],
    required: row.required,
    sortOrder: row.sortOrder,
    templateId: row.templateId,
    type: row.type,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function loadCandidateFormTemplateById(
  id: string,
): Promise<CandidateFormTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(candidateFormTemplate)
    .where(eq(candidateFormTemplate.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const questions = await db
    .select()
    .from(candidateFormTemplateQuestion)
    .where(eq(candidateFormTemplateQuestion.templateId, id))
    .orderBy(asc(candidateFormTemplateQuestion.sortOrder));
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    questions: questions.map(mapQuestionRow),
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}

// =====================================================================
// Candidate-side resolution
// =====================================================================

/**
 * Load all form templates that apply to a given interview, split into
 * `{ global, jobSpecific }`. Returned templates include their current
 * question list (not the historical snapshot).
 */
export async function loadApplicableCandidateFormTemplates(interviewRecordId: string): Promise<{
  global: CandidateFormTemplateRecord[];
  jobSpecific: CandidateFormTemplateRecord[];
}> {
  const [interviewRow] = await db
    .select({ jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);

  const jobDescriptionId = interviewRow?.jobDescriptionId ?? null;

  const templateRows = await db
    .select()
    .from(candidateFormTemplate)
    .where(
      or(
        eq(candidateFormTemplate.scope, "global"),
        jobDescriptionId
          ? and(
              eq(candidateFormTemplate.scope, "job_description"),
              eq(candidateFormTemplate.jobDescriptionId, jobDescriptionId),
            )
          : undefined,
      ),
    )
    .orderBy(asc(candidateFormTemplate.scope), asc(candidateFormTemplate.createdAt));

  if (templateRows.length === 0) {
    return { global: [], jobSpecific: [] };
  }

  const ids = templateRows.map((row) => row.id);
  const questionRows = await db
    .select()
    .from(candidateFormTemplateQuestion)
    .where(inArray(candidateFormTemplateQuestion.templateId, ids))
    .orderBy(asc(candidateFormTemplateQuestion.sortOrder));

  const questionsByTemplate = new Map<string, CandidateFormTemplateQuestionRecord[]>();
  for (const id of ids) {
    questionsByTemplate.set(id, []);
  }
  for (const row of questionRows) {
    questionsByTemplate.get(row.templateId)?.push(mapQuestionRow(row));
  }

  const toRecord = (row: (typeof templateRows)[number]): CandidateFormTemplateRecord => ({
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    questions: questionsByTemplate.get(row.id) ?? [],
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  });

  const global: CandidateFormTemplateRecord[] = [];
  const jobSpecific: CandidateFormTemplateRecord[] = [];
  for (const row of templateRows) {
    if (row.scope === "global") {
      global.push(toRecord(row));
    } else {
      jobSpecific.push(toRecord(row));
    }
  }
  return { global, jobSpecific };
}

/**
 * Compute the snapshot for the template's current state and return a matching
 * version (creating a new one if no hash match exists).
 *
 * Must be called inside a transaction. The `(templateId, contentHash)` unique
 * index guarantees that concurrent callers converge on the same version row
 * even if they both try to insert.
 */
export async function resolveOrCreateTemplateVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  templateId: string,
): Promise<CandidateFormTemplateVersionRecord> {
  const [templateRow] = await tx
    .select()
    .from(candidateFormTemplate)
    .where(eq(candidateFormTemplate.id, templateId))
    .limit(1);
  if (!templateRow) {
    throw new Error(`模版 ${templateId} 不存在`);
  }
  const questionRows = await tx
    .select()
    .from(candidateFormTemplateQuestion)
    .where(eq(candidateFormTemplateQuestion.templateId, templateId))
    .orderBy(asc(candidateFormTemplateQuestion.sortOrder));

  const snapshot: CandidateFormTemplateSnapshot = buildTemplateSnapshot({
    description: templateRow.description,
    jobDescriptionId: templateRow.jobDescriptionId,
    questions: questionRows.map(mapQuestionRow),
    scope: templateRow.scope,
    templateId: templateRow.id,
    title: templateRow.title,
  });
  const contentHash = hashTemplateSnapshot(snapshot);

  const [existing] = await tx
    .select()
    .from(candidateFormTemplateVersion)
    .where(
      and(
        eq(candidateFormTemplateVersion.templateId, templateId),
        eq(candidateFormTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      contentHash: existing.contentHash,
      createdAt: serializeDate(existing.createdAt),
      id: existing.id,
      snapshot: existing.snapshot,
      templateId: existing.templateId,
      version: existing.version,
    };
  }

  const [maxRow] = await tx
    .select({ maxVersion: candidateFormTemplateVersion.version })
    .from(candidateFormTemplateVersion)
    .where(eq(candidateFormTemplateVersion.templateId, templateId))
    .orderBy(desc(candidateFormTemplateVersion.version))
    .limit(1);
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  try {
    const [inserted] = await tx
      .insert(candidateFormTemplateVersion)
      .values({
        contentHash,
        createdAt: new Date(),
        id: crypto.randomUUID(),
        snapshot,
        templateId,
        version: nextVersion,
      })
      .returning();
    if (!inserted) {
      throw new Error("版本写入失败");
    }
    return {
      contentHash: inserted.contentHash,
      createdAt: serializeDate(inserted.createdAt),
      id: inserted.id,
      snapshot: inserted.snapshot,
      templateId: inserted.templateId,
      version: inserted.version,
    };
  } catch (error) {
    // Lost the race to another concurrent submitter — re-read by hash.
    const [loser] = await tx
      .select()
      .from(candidateFormTemplateVersion)
      .where(
        and(
          eq(candidateFormTemplateVersion.templateId, templateId),
          eq(candidateFormTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!loser) {
      throw error;
    }
    return {
      contentHash: loser.contentHash,
      createdAt: serializeDate(loser.createdAt),
      id: loser.id,
      snapshot: loser.snapshot,
      templateId: loser.templateId,
      version: loser.version,
    };
  }
}

export async function loadSubmittedTemplateIds(
  interviewRecordId: string,
  templateIds: string[],
): Promise<Set<string>> {
  if (templateIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ templateId: candidateFormSubmission.templateId })
    .from(candidateFormSubmission)
    .where(
      and(
        eq(candidateFormSubmission.interviewRecordId, interviewRecordId),
        inArray(candidateFormSubmission.templateId, templateIds),
      ),
    );
  return new Set(rows.map((row) => row.templateId));
}

export async function loadSubmissionsByInterview(
  interviewRecordId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const rows = await db
    .select({
      answers: candidateFormSubmission.answers,
      id: candidateFormSubmission.id,
      interviewRecordId: candidateFormSubmission.interviewRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: candidateFormSubmission.submittedAt,
      templateId: candidateFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: candidateFormSubmission.versionId,
    })
    .from(candidateFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .where(eq(candidateFormSubmission.interviewRecordId, interviewRecordId))
    .orderBy(asc(candidateFormSubmission.submittedAt));

  return rows.map((row) => ({
    answers: row.answers,
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    snapshot: row.snapshot,
    submittedAt: serializeDate(row.submittedAt),
    templateId: row.templateId,
    version: row.version,
    versionId: row.versionId,
  }));
}

export async function loadSubmissionsByTemplate(templateId: string): Promise<
  (CandidateFormSubmissionRecord & {
    candidateName: string | null;
    snapshot: CandidateFormTemplateSnapshot;
  })[]
> {
  const rows = await db
    .select({
      answers: candidateFormSubmission.answers,
      candidateName: studioInterview.candidateName,
      id: candidateFormSubmission.id,
      interviewRecordId: candidateFormSubmission.interviewRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: candidateFormSubmission.submittedAt,
      templateId: candidateFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: candidateFormSubmission.versionId,
    })
    .from(candidateFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .leftJoin(studioInterview, eq(candidateFormSubmission.interviewRecordId, studioInterview.id))
    .where(eq(candidateFormSubmission.templateId, templateId))
    .orderBy(desc(candidateFormSubmission.submittedAt));

  return rows.map((row) => ({
    answers: row.answers,
    candidateName: row.candidateName,
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    snapshot: row.snapshot,
    submittedAt: serializeDate(row.submittedAt),
    templateId: row.templateId,
    version: row.version,
    versionId: row.versionId,
  }));
}

export async function loadCandidateFormTemplateVersionById(
  templateId: string,
  versionId: string,
): Promise<CandidateFormTemplateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(candidateFormTemplateVersion)
    .where(
      and(
        eq(candidateFormTemplateVersion.id, versionId),
        eq(candidateFormTemplateVersion.templateId, templateId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    contentHash: row.contentHash,
    createdAt: serializeDate(row.createdAt),
    id: row.id,
    snapshot: row.snapshot,
    templateId: row.templateId,
    version: row.version,
  };
}
