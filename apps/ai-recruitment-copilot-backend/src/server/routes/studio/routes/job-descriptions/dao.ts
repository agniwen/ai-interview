import type {
  JobDescriptionInterviewerSummary,
  JobDescriptionListRecord,
  JobDescriptionMetrics,
  JobDescriptionRecord,
} from "@arc/shared/job-descriptions";
import {
  createDefaultResumeScreeningPolicy,
  resumeScreeningPolicySchema,
} from "@arc/shared/resume-screening";
import type { MinimaxVoiceId } from "@arc/db-schema/minimax-voices";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import type {
  PaginatedResult,
  PaginationParams,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";

const jobDescriptionListFiltersSchema = z.object({
  departmentId: z.string().trim().max(120).optional().nullable(),
  interviewerId: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
});

const SORT_COLUMNS = ["createdAt", "name", "updatedAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

const ORDER_COLUMNS = {
  createdAt: jobDescription.createdAt,
  name: jobDescription.name,
  updatedAt: jobDescription.updatedAt,
} as const;

const jobDescriptionPaginationSchema = makePaginationSchema(SORT_COLUMNS);

export type JobDescriptionPaginationParams = PaginationParams<SortColumn>;

export type PaginatedJobDescriptionResult = PaginatedResult<JobDescriptionListRecord>;

function parseResumeScreeningPolicy(value: unknown) {
  const parsedPolicy = resumeScreeningPolicySchema.safeParse(value);
  return parsedPolicy.success ? parsedPolicy.data : createDefaultResumeScreeningPolicy();
}

function buildWhereConditions({
  organizationId,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
}: {
  organizationId: string;
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
}) {
  const conditions: (ReturnType<typeof ilike> | ReturnType<typeof eq>)[] = [
    eq(jobDescription.organizationId, organizationId),
  ];
  if (search) {
    const searchCond = or(
      ilike(jobDescription.name, `%${search}%`),
      ilike(jobDescription.description, `%${search}%`),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }
  if (departmentIds && departmentIds.length > 0) {
    conditions.push(inArray(jobDescription.departmentId, departmentIds));
  }
  if (interviewerIds && interviewerIds.length > 0) {
    if (!jdIdsForInterviewers || jdIdsForInterviewers.length === 0) {
      // 选了面试官但没有任何关联 JD → 永远不命中 / short-circuit empty result.
      conditions.push(eq(jobDescription.id, "__never__"));
    } else {
      conditions.push(inArray(jobDescription.id, jdIdsForInterviewers));
    }
  }
  if (conditions.length === 0) {
    return;
  }
  return and(...conditions);
}

async function resolveJdIdsForInterviewers(
  organizationId: string,
  interviewerIds?: string[],
): Promise<string[] | undefined> {
  if (!interviewerIds || interviewerIds.length === 0) {
    return;
  }
  const rows = await db
    .select({ jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId })
    .from(jobDescriptionInterviewer)
    .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
    .where(
      and(
        inArray(jobDescriptionInterviewer.interviewerId, interviewerIds),
        eq(interviewer.organizationId, organizationId),
      ),
    );
  // 任意一个面试官 → 该 JD 命中（OR 语义）/ Any matching interviewer surfaces the JD.
  return uniq(rows.map((row) => row.jobDescriptionId));
}

function listJobDescriptionRows({
  organizationId,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
}: {
  organizationId: string;
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = buildWhereConditions({
    departmentIds,
    interviewerIds,
    jdIdsForInterviewers,
    organizationId,
    search,
  });

  let query = db
    .select({
      allowCrossDepartmentInterviewers: jobDescription.allowCrossDepartmentInterviewers,
      code: jobDescription.code,
      createdAt: jobDescription.createdAt,
      createdBy: jobDescription.createdBy,
      departmentId: jobDescription.departmentId,
      departmentName: department.name,
      description: jobDescription.description,
      id: jobDescription.id,
      name: jobDescription.name,
      presetQuestions: jobDescription.presetQuestions,
      prompt: jobDescription.prompt,
      resumeScreeningPolicy: jobDescription.resumeScreeningPolicy,
      resumeScreeningPolicyHash: jobDescription.resumeScreeningPolicyHash,
      resumeScreeningPolicyVersion: jobDescription.resumeScreeningPolicyVersion,
      updatedAt: jobDescription.updatedAt,
    })
    .from(jobDescription)
    .leftJoin(department, eq(jobDescription.departmentId, department.id))
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

async function countJobDescriptionRows({
  organizationId,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
}: {
  organizationId: string;
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
}) {
  const where = buildWhereConditions({
    departmentIds,
    interviewerIds,
    jdIdsForInterviewers,
    organizationId,
    search,
  });
  const [result] = await db.select({ count: count() }).from(jobDescription).where(where);
  return result?.count ?? 0;
}

async function loadInterviewersForJobDescriptions(
  jobDescriptionIds: string[],
): Promise<Map<string, JobDescriptionInterviewerSummary[]>> {
  const map = new Map<string, JobDescriptionInterviewerSummary[]>();
  if (jobDescriptionIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      interviewerId: jobDescriptionInterviewer.interviewerId,
      interviewerName: interviewer.name,
      interviewerVoice: interviewer.voice,
      jobDescriptionId: jobDescriptionInterviewer.jobDescriptionId,
    })
    .from(jobDescriptionInterviewer)
    .innerJoin(jobDescription, eq(jobDescriptionInterviewer.jobDescriptionId, jobDescription.id))
    .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
    .where(
      and(
        inArray(jobDescriptionInterviewer.jobDescriptionId, jobDescriptionIds),
        eq(interviewer.organizationId, jobDescription.organizationId),
      ),
    )
    .orderBy(asc(interviewer.name));

  for (const id of jobDescriptionIds) {
    map.set(id, []);
  }
  for (const row of rows) {
    const list = map.get(row.jobDescriptionId);
    if (list) {
      list.push({
        id: row.interviewerId,
        name: row.interviewerName,
        voice: row.interviewerVoice as MinimaxVoiceId,
      });
    }
  }
  return map;
}

async function loadResumeCountsForJobDescriptions(
  jobDescriptionIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (jobDescriptionIds.length === 0) {
    return map;
  }
  // 与 candidatesByJd 卡片保持一致：归档候选人不计入。
  // Mirror the candidatesByJd card: archived candidates are excluded.
  const rows = await db
    .select({
      count: count(),
      jobDescriptionId: studioInterview.jobDescriptionId,
    })
    .from(studioInterview)
    .where(
      and(
        inArray(studioInterview.jobDescriptionId, jobDescriptionIds),
        ne(studioInterview.pipelineStage, "closed"),
      ),
    )
    .groupBy(studioInterview.jobDescriptionId);

  for (const id of jobDescriptionIds) {
    map.set(id, 0);
  }
  for (const row of rows) {
    if (row.jobDescriptionId) {
      map.set(row.jobDescriptionId, row.count);
    }
  }
  return map;
}

function toJobDescriptionListRecord(
  row: Awaited<ReturnType<typeof listJobDescriptionRows>>[number],
  interviewers: JobDescriptionInterviewerSummary[],
  resumeCount: number,
): JobDescriptionListRecord {
  const resumeScreeningPolicy = parseResumeScreeningPolicy(row.resumeScreeningPolicy);
  return {
    allowCrossDepartmentInterviewers: row.allowCrossDepartmentInterviewers,
    code: row.code,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    description: row.description,
    id: row.id,
    interviewerIds: interviewers.map((item) => item.id),
    interviewers,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    resumeCount,
    resumeScreeningPolicy,
    resumeScreeningPolicyHash: row.resumeScreeningPolicyHash,
    resumeScreeningPolicyVersion: row.resumeScreeningPolicyVersion,
    updatedAt: serializeDate(row.updatedAt),
  };
}

// 多选过滤器在 URL/state 层用 CSV 字符串编码。后端这里把 CSV 切回 ID 数组。
// / Multi-select filters arrive as a comma-separated string; split into ids here.
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

function parseFilters(filters?: {
  search?: string | null;
  departmentId?: string | null;
  interviewerId?: string | null;
}) {
  const parsed = jobDescriptionListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { departmentIds: undefined, interviewerIds: undefined, search: undefined };
  }
  return {
    departmentIds: csvToIds(parsed.data.departmentId),
    interviewerIds: csvToIds(parsed.data.interviewerId),
    search: parsed.data.search?.trim() || undefined,
  };
}

export function parseJobDescriptionPagination(
  params?: Record<string, unknown>,
): JobDescriptionPaginationParams {
  return jobDescriptionPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedJobDescriptions(
  organizationId: string,
  filters?: {
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedJobDescriptionResult> {
  const { search, departmentIds, interviewerIds } = parseFilters(filters);
  const { page, pageSize, sortBy, sortOrder } = parseJobDescriptionPagination(pagination);
  const offset = (page - 1) * pageSize;
  const jdIdsForInterviewers = await resolveJdIdsForInterviewers(organizationId, interviewerIds);

  const [records, total] = await Promise.all([
    listJobDescriptionRows({
      departmentIds,
      interviewerIds,
      jdIdsForInterviewers,
      limit: pageSize,
      offset,
      organizationId,
      search,
      sortBy,
      sortOrder,
    }),
    countJobDescriptionRows({
      departmentIds,
      interviewerIds,
      jdIdsForInterviewers,
      organizationId,
      search,
    }),
  ]);

  const ids = records.map((record) => record.id);
  const [interviewersMap, resumeCountsMap] = await Promise.all([
    loadInterviewersForJobDescriptions(ids),
    loadResumeCountsForJobDescriptions(ids),
  ]);

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toJobDescriptionListRecord(
        record,
        interviewersMap.get(record.id) ?? [],
        resumeCountsMap.get(record.id) ?? 0,
      ),
    ),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listJobDescriptions(
  organizationId: string,
  filters?: {
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: Record<string, unknown>,
) {
  return queryPaginatedJobDescriptions(organizationId, filters, pagination);
}

export async function listAllJobDescriptions(
  organizationId: string,
): Promise<JobDescriptionListRecord[]> {
  const rows = await listJobDescriptionRows({ organizationId, sortBy: "name", sortOrder: "asc" });
  const ids = rows.map((row) => row.id);
  const [interviewersMap, resumeCountsMap] = await Promise.all([
    loadInterviewersForJobDescriptions(ids),
    loadResumeCountsForJobDescriptions(ids),
  ]);
  return rows.map((row) =>
    toJobDescriptionListRecord(
      row,
      interviewersMap.get(row.id) ?? [],
      resumeCountsMap.get(row.id) ?? 0,
    ),
  );
}

export async function fetchJobDescriptionsByCodes(
  organizationId: string,
  codes: readonly string[],
): Promise<{ code: string; id: string }[]> {
  const normalizedCodes = uniq(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  if (normalizedCodes.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      code: jobDescription.code,
      id: jobDescription.id,
    })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        inArray(jobDescription.code, normalizedCodes),
      ),
    );
  return rows.flatMap((row) => (row.code ? [{ code: row.code, id: row.id }] : []));
}

/**
 * 校验给定 ids 全部存在于 jobDescription 表。空数组视作合法。
 * Validate that every id in `ids` exists in jobDescription. Empty input is valid.
 */
export async function jobDescriptionIdsExist(
  ids: string[],
  organizationId: string,
): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  const rows = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(and(inArray(jobDescription.id, ids), eq(jobDescription.organizationId, organizationId)));
  return rows.length === new Set(ids).size;
}

export async function loadJobDescriptionById(
  organizationId: string,
  id: string,
): Promise<JobDescriptionRecord | null> {
  const [row] = await db
    .select()
    .from(jobDescription)
    .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    return null;
  }
  const interviewersMap = await loadInterviewersForJobDescriptions([id]);
  const interviewers = interviewersMap.get(id) ?? [];
  // eslint-disable-next-line no-use-before-define -- kept near public load functions for readability.
  return serializeJobDescription(
    row,
    interviewers.map((item) => item.id),
  );
}

// =========================================================================
// 头部 chart 聚合查询 / Header chart aggregations.
// =========================================================================

// 各卡片 Top N 上限：候选人分布卡用 treemap，撑得住 10 块；完成率 / 面试官负载
// 是分类条形，超过 5 条就显拥挤。
// Per-card Top N caps: the candidates treemap can host 10 cells comfortably,
// while the completion-rate bar and interviewer-load bar collapse past 5 rows.
const TOP_N_CANDIDATES = 10;
const TOP_N_COMPLETION = 5;
const TOP_N_LOAD = 5;

async function loadCandidatesByJd(organizationId: string) {
  // 每个 JD 关联的非归档简历数 Top N。LEFT JOIN 让没简历的 JD 也出现在结果集（0 候选）。
  // Top N JDs by non-archived candidate count. LEFT JOIN keeps JDs with zero
  // candidates in the result set (they'll surface only if Top N isn't filled).
  const rows = await db
    .select({
      count: count(studioInterview.id),
      id: jobDescription.id,
      name: jobDescription.name,
    })
    .from(jobDescription)
    .leftJoin(
      studioInterview,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(studioInterview.organizationId, organizationId),
        ne(studioInterview.pipelineStage, "closed"),
      ),
    )
    .where(eq(jobDescription.organizationId, organizationId))
    .groupBy(jobDescription.id, jobDescription.name)
    .orderBy(desc(count(studioInterview.id)), asc(jobDescription.name))
    .limit(TOP_N_CANDIDATES);

  return rows.map((row) => ({ count: row.count, id: row.id, name: row.name }));
}

async function loadCompletionByJd(organizationId: string) {
  // 每个 JD 名下所有候选人的轮次完成率：completed 数 / 总数。
  // HAVING total > 0 过滤掉完全没安排面试的 JD，避免 0/0 占满图。
  // 排序按完成率 desc，名字 asc 兜底。
  // Completion ratio per JD across all its candidates' schedule rows.
  // HAVING total > 0 hides JDs that have no scheduled rounds at all so the
  // chart doesn't fill up with 0/0 entries. Sorted by completion ratio desc.
  const done =
    sql<number>`COUNT(${studioInterviewSchedule.id}) FILTER (WHERE ${studioInterviewSchedule.status} = 'completed')`.mapWith(
      Number,
    );
  const total = sql<number>`COUNT(${studioInterviewSchedule.id})`.mapWith(Number);

  const rows = await db
    .select({
      done,
      id: jobDescription.id,
      name: jobDescription.name,
      total,
    })
    .from(jobDescription)
    .innerJoin(
      studioInterview,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(studioInterview.organizationId, organizationId),
      ),
    )
    .innerJoin(
      studioInterviewSchedule,
      eq(studioInterviewSchedule.interviewRecordId, studioInterview.id),
    )
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        ne(studioInterview.pipelineStage, "closed"),
      ),
    )
    .groupBy(jobDescription.id, jobDescription.name)
    .having(sql`COUNT(${studioInterviewSchedule.id}) > 0`)
    .orderBy(desc(sql`(${done})::float / NULLIF(${total}, 0)`), asc(jobDescription.name))
    .limit(TOP_N_COMPLETION);

  return rows.map((row) => ({
    done: row.done,
    id: row.id,
    name: row.name,
    total: row.total,
  }));
}

async function loadLoadByInterviewer(organizationId: string) {
  // 通过 job_description_interviewer 关联到 studio_interview，
  // 统计每位面试官已进入面试或 Offer 阶段的候选人数 DISTINCT 计数。
  // DISTINCT 是因为同一候选人可能落在多个 JD 的同一面试官关联上——但实际 schema
  // 是 1 候选人:1 JD，DISTINCT 主要做保险。
  // Walk interviewer → jobDescriptionInterviewer → studio_interview, counting
  // candidates in AI/human interview or offer stages per interviewer. DISTINCT is a
  // safety net — schema-wise a candidate maps to a single JD, so duplicates
  // shouldn't appear in practice.
  const rows = await db
    .select({
      activeCandidates: sql<number>`COUNT(DISTINCT ${studioInterview.id})`.mapWith(Number),
      id: interviewer.id,
      name: interviewer.name,
    })
    .from(interviewer)
    .innerJoin(
      jobDescriptionInterviewer,
      eq(jobDescriptionInterviewer.interviewerId, interviewer.id),
    )
    .innerJoin(
      studioInterview,
      and(
        eq(studioInterview.jobDescriptionId, jobDescriptionInterviewer.jobDescriptionId),
        eq(studioInterview.organizationId, organizationId),
        inArray(studioInterview.pipelineStage, ["ai_interview", "human_interview", "offer"]),
      ),
    )
    .where(eq(interviewer.organizationId, organizationId))
    .groupBy(interviewer.id, interviewer.name)
    .having(sql`COUNT(DISTINCT ${studioInterview.id}) > 0`)
    .orderBy(desc(sql`COUNT(DISTINCT ${studioInterview.id})`), asc(interviewer.name))
    .limit(TOP_N_LOAD);

  return rows.map((row) => ({
    activeCandidates: row.activeCandidates,
    id: row.id,
    name: row.name,
  }));
}

async function queryJobDescriptionMetrics(organizationId: string): Promise<JobDescriptionMetrics> {
  const [candidatesByJd, completionByJd, loadByInterviewer] = await Promise.all([
    loadCandidatesByJd(organizationId),
    loadCompletionByJd(organizationId),
    loadLoadByInterviewer(organizationId),
  ]);
  return { candidatesByJd, completionByJd, loadByInterviewer };
}

/**
 * 在招岗位管理页头部 chart 聚合的缓存入口。
 * cacheTag 与列表查询共用 `job-descriptions`，再额外打 `studio-resumes` —— 候选人维度
 * 数据也会驱动 candidatesByJd / completionByJd / loadByInterviewer，招聘台写操作必须能拉到新值。
 *
 * Cached entry for the JD-management header charts. Carries both the
 * `job-descriptions` tag (list-query parity) and `studio-resumes` because the
 * candidate-derived bars need to refresh whenever a resume row mutates.
 */
export function loadJobDescriptionMetrics(organizationId: string): Promise<JobDescriptionMetrics> {
  return queryJobDescriptionMetrics(organizationId);
}

export function serializeJobDescription(
  row: typeof jobDescription.$inferSelect,
  interviewerIds: string[],
): JobDescriptionRecord {
  const resumeScreeningPolicy = parseResumeScreeningPolicy(row.resumeScreeningPolicy);
  return {
    allowCrossDepartmentInterviewers: row.allowCrossDepartmentInterviewers,
    code: row.code,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    departmentId: row.departmentId,
    description: row.description,
    id: row.id,
    interviewerIds,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    resumeScreeningPolicy,
    resumeScreeningPolicyHash: row.resumeScreeningPolicyHash,
    resumeScreeningPolicyVersion: row.resumeScreeningPolicyVersion,
    updatedAt: serializeDate(row.updatedAt),
  };
}
