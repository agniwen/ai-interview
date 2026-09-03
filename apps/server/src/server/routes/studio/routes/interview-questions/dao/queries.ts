import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateQuestionRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
  JobDescriptionRef,
} from "@app/db-schema/interview-question-templates";
import { buildTemplateSnapshot } from "@app/db-schema/interview-question-templates";
import type { SQL } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../lib/server/db/index";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "../../../../../../lib/server/db/pagination";
import type { PaginatedResult, PaginationParams } from "../../../../../../lib/server/db/pagination";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import { hashTemplateSourceSnapshot } from "../../../../../../lib/server/interview-question-templates-hash";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  jobDescription,
} from "@app/db-schema/schema";

// =====================================================================
// Pagination + filters
// =====================================================================

// 多选过滤器走 CSV / Multi-select filters: CSV serialization in URL/state.
const templateListFiltersSchema = z.object({
  jobDescriptionId: z.string().trim().max(2000).optional().nullable(),
  scope: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  textFilters: listTextFiltersSchema("questions"),
});

const SORT_COLUMNS = ["createdAt", "title", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const ORDER_COLUMNS = {
  createdAt: interviewQuestionTemplate.createdAt,
  title: interviewQuestionTemplate.title,
  updatedAt: interviewQuestionTemplate.updatedAt,
} as const;

const templatePaginationSchema = makePaginationSchema(SORT_COLUMNS);
const templatePaginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});
const interviewQuestionTemplateScopeSchema = z.enum(["global", "job_description"]);

export type InterviewQuestionTemplatePaginationParams = PaginationParams<SortColumn>;
type InterviewQuestionTemplatePaginationInput = z.input<typeof templatePaginationInputSchema>;

export type PaginatedInterviewQuestionTemplateResult =
  PaginatedResult<InterviewQuestionTemplateListRecord>;

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
  scopes?: InterviewQuestionTemplateScope[];
  jobDescriptionIds?: string[];
  // 三态：active = 仅未归档（默认），archived = 仅已归档，all = 全部。
  // Tri-state filter: active = active only (default), archived = archived only, all = both.
  archivedFilter?: ArchivedFilter;
}) {
  const conditions: SQL<unknown>[] = [eq(interviewQuestionTemplate.organizationId, organizationId)];
  if (!archivedFilter || archivedFilter === "active") {
    conditions.push(isNull(interviewQuestionTemplate.archivedAt));
  } else if (archivedFilter === "archived") {
    conditions.push(isNotNull(interviewQuestionTemplate.archivedAt));
  }
  if (search) {
    const searchCond = or(
      ilike(interviewQuestionTemplate.title, `%${search}%`),
      ilike(interviewQuestionTemplate.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (scopes && scopes.length > 0) {
    conditions.push(inArray(interviewQuestionTemplate.scope, scopes));
  }
  if (jobDescriptionIds && jobDescriptionIds.length > 0) {
    // 模板只要有任一关联到所选 JD 即可命中（OR 语义）
    // / Template surfaces if linked to ANY of the selected JDs.
    conditions.push(
      exists(
        db
          .select({ one: interviewQuestionTemplateJobDescription.templateId })
          .from(interviewQuestionTemplateJobDescription)
          .innerJoin(
            jobDescription,
            eq(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescription.id),
          )
          .where(
            and(
              eq(interviewQuestionTemplateJobDescription.templateId, interviewQuestionTemplate.id),
              inArray(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescriptionIds),
              eq(jobDescription.organizationId, interviewQuestionTemplate.organizationId),
            ),
          ),
      ),
    );
  }
  const atomic = buildListTextFilterWhere("questions", textFilters, {
    description: interviewQuestionTemplate.description,
    title: interviewQuestionTemplate.title,
  });
  if (atomic) {
    conditions.push(atomic);
  }
  return and(...conditions);
}

export async function loadJobDescriptionsByTemplate(
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
      templateId: interviewQuestionTemplateJobDescription.templateId,
    })
    .from(interviewQuestionTemplateJobDescription)
    .innerJoin(
      interviewQuestionTemplate,
      eq(interviewQuestionTemplateJobDescription.templateId, interviewQuestionTemplate.id),
    )
    .innerJoin(
      jobDescription,
      and(
        eq(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, interviewQuestionTemplate.organizationId),
      ),
    )
    .where(inArray(interviewQuestionTemplateJobDescription.templateId, templateIds))
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
  scopes?: InterviewQuestionTemplateScope[];
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
      archivedAt: interviewQuestionTemplate.archivedAt,
      createdAt: interviewQuestionTemplate.createdAt,
      createdBy: interviewQuestionTemplate.createdBy,
      description: interviewQuestionTemplate.description,
      id: interviewQuestionTemplate.id,
      scope: interviewQuestionTemplate.scope,
      title: interviewQuestionTemplate.title,
      updatedAt: interviewQuestionTemplate.updatedAt,
    })
    .from(interviewQuestionTemplate)
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
  scopes?: InterviewQuestionTemplateScope[];
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
  const [result] = await db.select({ count: count() }).from(interviewQuestionTemplate).where(where);
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
      templateId: interviewQuestionTemplateQuestion.templateId,
    })
    .from(interviewQuestionTemplateQuestion)
    .where(inArray(interviewQuestionTemplateQuestion.templateId, templateIds))
    .groupBy(interviewQuestionTemplateQuestion.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

async function loadBindingCountsByTemplate(templateIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (templateIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      count: count(),
      templateId: interviewQuestionTemplateBinding.templateId,
    })
    .from(interviewQuestionTemplateBinding)
    .where(inArray(interviewQuestionTemplateBinding.templateId, templateIds))
    .groupBy(interviewQuestionTemplateBinding.templateId);
  for (const row of rows) {
    map.set(row.templateId, row.count);
  }
  return map;
}

function toListRecord(
  row: Awaited<ReturnType<typeof listTemplateRows>>[number],
  questionCount: number,
  bindingCount: number,
  jobDescriptions: JobDescriptionRef[],
): InterviewQuestionTemplateListRecord {
  return {
    archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
    bindingCount,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionIds: jobDescriptions.map((jd) => jd.id),
    jobDescriptions,
    questionCount,
    scope: row.scope,
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

function parseScopes(value?: string | null): InterviewQuestionTemplateScope[] | undefined {
  const ids = csvToIds(value);
  if (!ids) {
    return;
  }
  const valid = ids.flatMap((id) => {
    const parsed = interviewQuestionTemplateScopeSchema.safeParse(id);
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

function parseInterviewQuestionTemplatePagination(
  params?: InterviewQuestionTemplatePaginationInput,
): InterviewQuestionTemplatePaginationParams {
  return templatePaginationSchema.parse(templatePaginationInputSchema.parse(params ?? {}));
}

// =====================================================================
// Public queries
// =====================================================================

export async function queryPaginatedInterviewQuestionTemplates(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
    archivedFilter?: ArchivedFilter;
  },
  pagination?: InterviewQuestionTemplatePaginationInput,
): Promise<PaginatedInterviewQuestionTemplateResult> {
  const { textFilters, search, scopes, jobDescriptionIds } = parseFilters(filters);
  const archivedFilter: ArchivedFilter = filters?.archivedFilter ?? "active";
  const { page, pageSize, sortBy, sortOrder } =
    parseInterviewQuestionTemplatePagination(pagination);
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
  const [questionCounts, bindingCounts, jdsByTemplate] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadBindingCountsByTemplate(ids),
    loadJobDescriptionsByTemplate(ids),
  ]);

  return {
    page,
    pageSize,
    records: rows.map((row) =>
      toListRecord(
        row,
        questionCounts.get(row.id) ?? 0,
        bindingCounts.get(row.id) ?? 0,
        jdsByTemplate.get(row.id) ?? [],
      ),
    ),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listInterviewQuestionTemplates(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
    archivedFilter?: ArchivedFilter;
  },
  pagination?: InterviewQuestionTemplatePaginationInput,
) {
  return queryPaginatedInterviewQuestionTemplates(organizationId, filters, pagination);
}

export async function listAllInterviewQuestionTemplates(
  organizationId: string,
): Promise<InterviewQuestionTemplateListRecord[]> {
  const rows = await listTemplateRows({ organizationId, sortBy: "title", sortOrder: "asc" });
  const ids = rows.map((row) => row.id);
  const [questionCounts, bindingCounts, jdsByTemplate] = await Promise.all([
    loadQuestionCountsByTemplate(ids),
    loadBindingCountsByTemplate(ids),
    loadJobDescriptionsByTemplate(ids),
  ]);
  return rows.map((row) =>
    toListRecord(
      row,
      questionCounts.get(row.id) ?? 0,
      bindingCounts.get(row.id) ?? 0,
      jdsByTemplate.get(row.id) ?? [],
    ),
  );
}

export function mapQuestionRow(
  row: typeof interviewQuestionTemplateQuestion.$inferSelect,
): InterviewQuestionTemplateQuestionRecord {
  return {
    content: row.content,
    createdAt: serializeDate(row.createdAt),
    difficulty: row.difficulty,
    evaluationFocus: row.evaluationFocus,
    followUpDirections: row.followUpDirections,
    id: row.id,
    sortOrder: row.sortOrder,
    templateId: row.templateId,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function loadInterviewQuestionTemplateById(
  organizationId: string,
  id: string,
): Promise<InterviewQuestionTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(interviewQuestionTemplate)
    .where(
      and(
        eq(interviewQuestionTemplate.id, id),
        eq(interviewQuestionTemplate.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const [questions, jds, versionRows] = await Promise.all([
    db
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(eq(interviewQuestionTemplateQuestion.templateId, id))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
    loadJobDescriptionRefs(id),
    db
      .select({ snapshot: interviewQuestionTemplateVersion.snapshot })
      .from(interviewQuestionTemplateVersion)
      .where(eq(interviewQuestionTemplateVersion.templateId, id))
      .orderBy(desc(interviewQuestionTemplateVersion.version)),
  ]);
  const sourceSnapshot = buildTemplateSnapshot({
    description: row.description,
    jobDescriptionIds: jds.map((jd) => jd.id),
    questions: questions.map(mapQuestionRow),
    scope: row.scope,
    templateId: row.id,
    title: row.title,
  });
  const sourceHash = hashTemplateSourceSnapshot(sourceSnapshot);
  const currentVersion = versionRows.find(
    (version) => hashTemplateSourceSnapshot(version.snapshot) === sourceHash,
  );
  const latestQuestionById = new Map(
    (currentVersion?.snapshot.questions ?? []).map((question) => [question.id, question]),
  );
  return {
    archivedAt: row.archivedAt ? serializeDate(row.archivedAt) : null,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    jobDescriptionIds: jds.map((jd) => jd.id),
    jobDescriptions: jds,
    questions: questions.map((question) => ({
      ...mapQuestionRow(question),
      followUpContract: (() => {
        const snapshotQuestion = latestQuestionById.get(question.id);
        return snapshotQuestion &&
          snapshotQuestion.content === question.content &&
          (snapshotQuestion.evaluationFocus ?? null) === question.evaluationFocus &&
          (snapshotQuestion.followUpDirections ?? null) === question.followUpDirections
          ? (snapshotQuestion.followUpContract ?? null)
          : null;
      })(),
    })),
    scope: row.scope,
    title: row.title,
    updatedAt: serializeDate(row.updatedAt),
  };
}
