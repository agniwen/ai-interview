import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateQuestionRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
  JobDescriptionRef,
} from "@/lib/shared/interview-question-templates";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, exists, ilike, inArray, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  jobDescription,
} from "@/lib/shared/db/schema";

// =====================================================================
// Pagination + filters
// =====================================================================

// 多选过滤器走 CSV / Multi-select filters: CSV serialization in URL/state.
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

export type InterviewQuestionTemplatePaginationParams = z.infer<typeof templatePaginationSchema>;

export interface PaginatedInterviewQuestionTemplateResult {
  records: InterviewQuestionTemplateListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildWhereConditions({
  organizationId,
  search,
  scopes,
  jobDescriptionIds,
}: {
  organizationId: string;
  search?: string;
  scopes?: InterviewQuestionTemplateScope[];
  jobDescriptionIds?: string[];
}) {
  const conditions: SQL<unknown>[] = [eq(interviewQuestionTemplate.organizationId, organizationId)];
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
          .where(
            and(
              eq(interviewQuestionTemplateJobDescription.templateId, interviewQuestionTemplate.id),
              inArray(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescriptionIds),
            ),
          ),
      ),
    );
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
      jobDescription,
      eq(interviewQuestionTemplateJobDescription.jobDescriptionId, jobDescription.id),
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

function buildOrderBy(sortBy: SortColumn, sortOrder: "asc" | "desc") {
  const columnMap = {
    createdAt: interviewQuestionTemplate.createdAt,
    title: interviewQuestionTemplate.title,
    updatedAt: interviewQuestionTemplate.updatedAt,
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
  organizationId,
  search,
  scopes,
  jobDescriptionIds,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  search?: string;
  scopes?: InterviewQuestionTemplateScope[];
  jobDescriptionIds?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({ jobDescriptionIds, organizationId, scopes, search });

  let query = db
    .select({
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
  organizationId,
  search,
  scopes,
  jobDescriptionIds,
}: {
  organizationId: string;
  search?: string;
  scopes?: InterviewQuestionTemplateScope[];
  jobDescriptionIds?: string[];
}) {
  const where = buildWhereConditions({ jobDescriptionIds, organizationId, scopes, search });
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

const VALID_SCOPES: readonly InterviewQuestionTemplateScope[] = ["global", "job_description"];

function parseScopes(value?: string | null): InterviewQuestionTemplateScope[] | undefined {
  const ids = csvToIds(value);
  if (!ids) {
    return;
  }
  const valid = ids.filter((id): id is InterviewQuestionTemplateScope =>
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

function parseInterviewQuestionTemplatePagination(
  params?: Record<string, unknown>,
): InterviewQuestionTemplatePaginationParams {
  return templatePaginationSchema.parse(params ?? {});
}

// =====================================================================
// Public queries
// =====================================================================

export async function queryPaginatedInterviewQuestionTemplates(
  organizationId: string,
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedInterviewQuestionTemplateResult> {
  const { search, scopes, jobDescriptionIds } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } =
    parseInterviewQuestionTemplatePagination(pagination);
  const offset = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    listTemplateRows({
      jobDescriptionIds,
      limit: pageSize,
      offset,
      organizationId,
      scopes,
      search,
      sortBy,
      sortOrder,
    }),
    countTemplateRows({ jobDescriptionIds, organizationId, scopes, search }),
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
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export async function listInterviewQuestionTemplates(
  organizationId: string,
  filters?: {
    search?: string | null;
    scope?: string | null;
    jobDescriptionId?: string | null;
  },
  pagination?: Record<string, unknown>,
) {
  "use cache";
  cacheTag(`interview-question-templates:${organizationId}`);
  cacheLife("minutes");

  return queryPaginatedInterviewQuestionTemplates(organizationId, filters, pagination);
}

// oxlint-disable-next-line require-await
export async function listAllInterviewQuestionTemplates(
  organizationId: string,
): Promise<InterviewQuestionTemplateListRecord[]> {
  "use cache";
  cacheTag(`interview-question-templates:${organizationId}`);
  cacheLife("minutes");

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
  const [questions, jds] = await Promise.all([
    db
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(eq(interviewQuestionTemplateQuestion.templateId, id))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
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
