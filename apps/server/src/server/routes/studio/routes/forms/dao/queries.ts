import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import type {
  CandidateFormScope,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateQuestionRecord,
  CandidateFormTemplateRecord,
  JobDescriptionRef,
} from "@app/db-schema/candidate-forms";
import type { SQL } from "drizzle-orm";
import { and, asc, count, eq, exists, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../lib/server/db/index";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "../../../../../../lib/server/db/pagination";
import type { PaginatedResult, PaginationParams } from "../../../../../../lib/server/db/pagination";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  jobDescription,
  studioInterview,
} from "@app/db-schema/schema";

// =====================================================================
// Pagination + filters
// =====================================================================

// 多选过滤器走 CSV 字符串 / Multi-select filters use CSV string serialization.
const templateListFiltersSchema = z.object({
  jobDescriptionId: z.string().trim().max(2000).optional().nullable(),
  scope: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  textFilters: listTextFiltersSchema("forms"),
});

const SORT_COLUMNS = ["createdAt", "title", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const ORDER_COLUMNS = {
  createdAt: candidateFormTemplate.createdAt,
  title: candidateFormTemplate.title,
  updatedAt: candidateFormTemplate.updatedAt,
} as const;

const templatePaginationSchema = makePaginationSchema(SORT_COLUMNS);
const templatePaginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});
const candidateFormScopeSchema = z.enum(["global", "job_description"]);

export type CandidateFormTemplatePaginationParams = PaginationParams<SortColumn>;
type CandidateFormTemplatePaginationInput = z.input<typeof templatePaginationInputSchema>;

export type PaginatedCandidateFormTemplateResult = PaginatedResult<CandidateFormTemplateListRecord>;

export type ArchivedFilter = "active" | "archived" | "all";

function buildWhereConditions({
  organizationId,
  textFilters,
  search,
  scopes,
  jobDescriptionIds,
  archivedFilter,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
  // 三态：active = 仅未归档（默认），archived = 仅已归档，all = 全部。
  // Tri-state filter: active = active only (default), archived = archived only, all = both.
  archivedFilter?: ArchivedFilter;
}) {
  const conditions: SQL<unknown>[] = [eq(candidateFormTemplate.organizationId, organizationId)];
  if (!archivedFilter || archivedFilter === "active") {
    conditions.push(isNull(candidateFormTemplate.archivedAt));
  } else if (archivedFilter === "archived") {
    conditions.push(isNotNull(candidateFormTemplate.archivedAt));
  }
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
          .innerJoin(
            jobDescription,
            eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
          )
          .where(
            and(
              eq(candidateFormTemplateJobDescription.templateId, candidateFormTemplate.id),
              inArray(candidateFormTemplateJobDescription.jobDescriptionId, jobDescriptionIds),
              eq(jobDescription.organizationId, candidateFormTemplate.organizationId),
            ),
          ),
      ),
    );
  }
  const atomic = buildListTextFilterWhere("forms", textFilters, {
    description: candidateFormTemplate.description,
    title: candidateFormTemplate.title,
  });
  if (atomic) {
    conditions.push(atomic);
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
      candidateFormTemplate,
      eq(candidateFormTemplateJobDescription.templateId, candidateFormTemplate.id),
    )
    .innerJoin(
      jobDescription,
      and(
        eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, candidateFormTemplate.organizationId),
      ),
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

// =====================================================================
// Row loaders (shared)
// =====================================================================

function listTemplateRows({
  organizationId,
  textFilters,
  search,
  scopes,
  jobDescriptionIds,
  archivedFilter,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
  archivedFilter?: ArchivedFilter;
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({
    archivedFilter,
    jobDescriptionIds,
    organizationId,
    scopes,
    search,
    textFilters,
  });

  let query = db
    .select({
      archivedAt: candidateFormTemplate.archivedAt,
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
    .orderBy(buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder))
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
  organizationId,
  textFilters,
  search,
  scopes,
  jobDescriptionIds,
  archivedFilter,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  scopes?: CandidateFormScope[];
  jobDescriptionIds?: string[];
  archivedFilter?: ArchivedFilter;
}) {
  const where = buildWhereConditions({
    archivedFilter,
    jobDescriptionIds,
    organizationId,
    scopes,
    search,
    textFilters,
  });
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
    archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
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

function parseScopes(value?: string | null): CandidateFormScope[] | undefined {
  const ids = csvToIds(value);
  if (!ids) {
    return;
  }
  const valid = ids.flatMap((id) => {
    const parsed = candidateFormScopeSchema.safeParse(id);
    return parsed.success ? [parsed.data] : [];
  });
  return valid.length > 0 ? valid : undefined;
}

function parseFilters(filters?: {
  textFilters?: string;
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
      textFilters: undefined,
    };
  }
  return {
    jobDescriptionIds: csvToIds(parsed.data.jobDescriptionId),
    scopes: parseScopes(parsed.data.scope),
    search: parsed.data.search?.trim() || undefined,
    textFilters: parsed.data.textFilters,
  };
}

function parseCandidateFormTemplatePagination(
  params?: CandidateFormTemplatePaginationInput,
): CandidateFormTemplatePaginationParams {
  return templatePaginationSchema.parse(templatePaginationInputSchema.parse(params ?? {}));
}

// =====================================================================
// Public queries
// =====================================================================

export async function queryPaginatedCandidateFormTemplates(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
    archivedFilter?: ArchivedFilter;
  },
  pagination?: CandidateFormTemplatePaginationInput,
): Promise<PaginatedCandidateFormTemplateResult> {
  const { textFilters, search, scopes, jobDescriptionIds } = parseFilters(filters);
  const archivedFilter: ArchivedFilter = filters?.archivedFilter ?? "active";
  const { page, pageSize, sortBy, sortOrder } = parseCandidateFormTemplatePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listTemplateRows({
      archivedFilter,
      jobDescriptionIds,
      limit: pageSize,
      offset,
      organizationId,
      scopes,
      search,
      sortBy,
      sortOrder,
      textFilters,
    }),
    countTemplateRows({
      archivedFilter,
      jobDescriptionIds,
      organizationId,
      scopes,
      search,
      textFilters,
    }),
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
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listCandidateFormTemplates(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
    archivedFilter?: ArchivedFilter;
  },
  pagination?: CandidateFormTemplatePaginationInput,
) {
  return queryPaginatedCandidateFormTemplates(organizationId, filters, pagination);
}

export async function listAllCandidateFormTemplates(
  organizationId: string,
): Promise<CandidateFormTemplateListRecord[]> {
  const rows = await listTemplateRows({ organizationId, sortBy: "title", sortOrder: "asc" });
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
  organizationId: string,
  id: string,
): Promise<CandidateFormTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(candidateFormTemplate)
    .where(
      and(
        eq(candidateFormTemplate.id, id),
        eq(candidateFormTemplate.organizationId, organizationId),
      ),
    )
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
    archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
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
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
      organizationId: studioInterview.organizationId,
    })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);

  if (!interviewRow) {
    return { global: [], jobSpecific: [] };
  }

  const jobDescriptionId = interviewRow?.jobDescriptionId ?? null;
  const { organizationId } = interviewRow;

  const templateRows = await db
    .select()
    .from(candidateFormTemplate)
    .where(
      and(
        // 已归档的表单不出现在候选人面前；归档 = 不再向新候选人推送，但
        // 已经填过的 submission 仍保留，互不影响。
        // Archived templates are hidden from candidates; existing submissions
        // remain intact.
        isNull(candidateFormTemplate.archivedAt),
        eq(candidateFormTemplate.organizationId, organizationId),
        or(
          eq(candidateFormTemplate.scope, "global"),
          jobDescriptionId
            ? and(
                eq(candidateFormTemplate.scope, "job_description"),
                exists(
                  db
                    .select({ one: candidateFormTemplateJobDescription.templateId })
                    .from(candidateFormTemplateJobDescription)
                    .innerJoin(
                      jobDescription,
                      eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescription.id),
                    )
                    .where(
                      and(
                        eq(
                          candidateFormTemplateJobDescription.templateId,
                          candidateFormTemplate.id,
                        ),
                        eq(candidateFormTemplateJobDescription.jobDescriptionId, jobDescriptionId),
                        eq(jobDescription.organizationId, candidateFormTemplate.organizationId),
                      ),
                    ),
                ),
              )
            : undefined,
        ),
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
      archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
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
