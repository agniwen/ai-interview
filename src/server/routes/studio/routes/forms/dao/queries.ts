import type {
  CandidateFormScope,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateQuestionRecord,
  CandidateFormTemplateRecord,
  JobDescriptionRef,
} from "@/lib/shared/candidate-forms";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, exists, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  jobDescription,
  studioInterview,
} from "@/lib/server/db/schema";

// =====================================================================
// Pagination + filters
// =====================================================================

// 多选过滤器走 CSV 字符串 / Multi-select filters use CSV string serialization.
const templateListFiltersSchema = z.object({
  jobDescriptionId: z.string().trim().max(2000).optional().nullable(),
  scope: z.string().trim().max(120).optional().nullable(),
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
  scopes,
  jobDescriptionIds,
}: {
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
}) {
  const conditions: SQL<unknown>[] = [];
  if (search) {
    const searchCond = or(
      ilike(candidateFormTemplate.title, `%${search}%`),
      ilike(candidateFormTemplate.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (scopes && scopes.length > 0) {
    conditions.push(inArray(candidateFormTemplate.scope, scopes));
  }
  if (jobDescriptionIds && jobDescriptionIds.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: candidateFormTemplateJobDescription.templateId })
          .from(candidateFormTemplateJobDescription)
          .where(
            and(
              eq(candidateFormTemplateJobDescription.templateId, candidateFormTemplate.id),
              inArray(candidateFormTemplateJobDescription.jobDescriptionId, jobDescriptionIds),
            ),
          ),
      ),
    );
  }
  if (conditions.length === 0) {
    return;
  }
  return and(...conditions);
}

async function loadJobDescriptionsByTemplate(
  templateIds: string[],
): Promise<Map<string, JobDescriptionRef[]>> {
  const map = new Map<string, JobDescriptionRef[]>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      id: jobDescription.id,
      name: jobDescription.name,
      templateId: candidateFormTemplateJobDescription.templateId,
    })
    .from(candidateFormTemplateJobDescription)
    .innerJoin(
      jobDescription,
      eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
    )
    .where(inArray(candidateFormTemplateJobDescription.templateId, templateIds))
    .orderBy(asc(jobDescription.name));
  for (const row of rows) {
    const list = map.get(row.templateId);
    const ref: JobDescriptionRef = { id: row.id, name: row.name };
    if (list) {
      list.push(ref);
    } else {
      map.set(row.templateId, [ref]);
    }
  }
  return map;
}

async function loadJobDescriptionRefs(templateId: string): Promise<JobDescriptionRef[]> {
  const refs = await loadJobDescriptionsByTemplate([templateId]);
  return refs.get(templateId) ?? [];
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

export function serializeDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// =====================================================================
// Row loaders (shared)
// =====================================================================

function listTemplateRows({
  search,
  scopes,
  jobDescriptionIds,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ jobDescriptionIds, scopes, search });

  let query = db
    .select({
      createdAt: candidateFormTemplate.createdAt,
      createdBy: candidateFormTemplate.createdBy,
      description: candidateFormTemplate.description,
      id: candidateFormTemplate.id,
      scope: candidateFormTemplate.scope,
      title: candidateFormTemplate.title,
      updatedAt: candidateFormTemplate.updatedAt,
    })
    .from(candidateFormTemplate)
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
  scopes,
  jobDescriptionIds,
}: {
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
}) {
  const where = buildWhereConditions({ jobDescriptionIds, scopes, search });
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
  jobDescriptions: JobDescriptionRef[],
): CandidateFormTemplateListRecord {
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionIds: jobDescriptions.map((jd) => jd.id),
    jobDescriptions,
    questionCount,
    scope: row.scope,
    submissionCount,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}

function csvToIds(value?: string | null): string[] | undefined {
  if (!value) {
    return;
  }
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

const VALID_SCOPES: readonly CandidateFormScope[] = ["global", "job_description"];

function parseScopes(value?: string | null): CandidateFormScope[] | undefined {
  const ids = csvToIds(value);
  if (!ids) {
    return;
  }
  const valid = ids.filter((id): id is CandidateFormScope =>
    (VALID_SCOPES as readonly string[]).includes(id),
  );
  return valid.length > 0 ? valid : undefined;
}

function parseFilters(filters?: {
  search?: string | null;
  scope?: string | null;
  jobDescriptionId?: string | null;
}) {
  const parsed = templateListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return {
      jobDescriptionIds: undefined,
      scopes: undefined,
      search: undefined,
    };
  }
  return {
    jobDescriptionIds: csvToIds(parsed.data.jobDescriptionId),
    scopes: parseScopes(parsed.data.scope),
    search: parsed.data.search?.trim() || undefined,
  };
}

function parseCandidateFormTemplatePagination(
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
  const { search, scopes, jobDescriptionIds } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseCandidateFormTemplatePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listTemplateRows({
      jobDescriptionIds,
      limit: pageSize,
      offset,
      scopes,
      search,
      sortBy,
      sortOrder,
    }),
    countTemplateRows({ jobDescriptionIds, scopes, search }),
  ]);

  const ids = rows.map((row) => row.id);
  const [questionCounts, submissionCounts, jdsByTemplate] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadSubmissionCountsByTemplate(ids),
    loadJobDescriptionsByTemplate(ids),
  ]);

  return {
    page,
    pageSize,
    records: rows.map((row) =>
      toListRecord(
        row,
        questionCounts.get(row.id) ?? 0,
        submissionCounts.get(row.id) ?? 0,
        jdsByTemplate.get(row.id) ?? [],
      ),
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
  const [questionCounts, submissionCounts, jdsByTemplate] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadSubmissionCountsByTemplate(ids),
    loadJobDescriptionsByTemplate(ids),
  ]);
  return rows.map((row) =>
    toListRecord(
      row,
      questionCounts.get(row.id) ?? 0,
      submissionCounts.get(row.id) ?? 0,
      jdsByTemplate.get(row.id) ?? [],
    ),
  );
}

export function mapQuestionRow(
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
  const [questions, jds] = await Promise.all([
    db
      .select()
      .from(candidateFormTemplateQuestion)
      .where(eq(candidateFormTemplateQuestion.templateId, id))
      .orderBy(asc(candidateFormTemplateQuestion.sortOrder)),
    loadJobDescriptionRefs(id),
  ]);
  return {
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionIds: jds.map((jd) => jd.id),
    jobDescriptions: jds,
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
              exists(
                db
                  .select({ one: candidateFormTemplateJobDescription.templateId })
                  .from(candidateFormTemplateJobDescription)
                  .where(
                    and(
                      eq(candidateFormTemplateJobDescription.templateId, candidateFormTemplate.id),
                      eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescriptionId),
                    ),
                  ),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(candidateFormTemplate.scope), asc(candidateFormTemplate.createdAt));

  if (templateRows.length === 0) {
    return { global: [], jobSpecific: [] };
  }

  const ids = templateRows.map((row) => row.id);
  const [questionRows, jdsByTemplate] = await Promise.all([
    db
      .select()
      .from(candidateFormTemplateQuestion)
      .where(inArray(candidateFormTemplateQuestion.templateId, ids))
      .orderBy(asc(candidateFormTemplateQuestion.sortOrder)),
    loadJobDescriptionsByTemplate(ids),
  ]);

  const questionsByTemplate = new Map<string, CandidateFormTemplateQuestionRecord[]>();
  for (const id of ids) {
    questionsByTemplate.set(id, []);
  }
  for (const row of questionRows) {
    questionsByTemplate.get(row.templateId)?.push(mapQuestionRow(row));
  }

  const toRecord = (row: (typeof templateRows)[number]): CandidateFormTemplateRecord => {
    const jds = jdsByTemplate.get(row.id) ?? [];
    return {
      createdAt: serializeDate(row.createdAt),
      createdBy: row.createdBy,
      description: row.description,
      id: row.id,
      jobDescriptionIds: jds.map((jd) => jd.id),
      jobDescriptions: jds,
      questions: questionsByTemplate.get(row.id) ?? [],
      scope: row.scope,
      title: row.title,
      updatedAt: serializeDate(row.updatedAt),
    };
  };

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
