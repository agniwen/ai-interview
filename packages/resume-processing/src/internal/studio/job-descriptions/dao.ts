import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { buildListTextFilterWhere } from "../../lib/db/list-text-filters";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
/* oxlint-disable max-lines -- this route-owned read model keeps job list, detail, and metrics serialization aligned. */
import type {
  JobDescriptionInterviewerSummary,
  JobDescriptionListRecord,
  JobDescriptionMetrics,
  JobDescriptionRecord,
} from "@app/shared/job-descriptions";
import {
  createDefaultResumeScreeningPolicy,
  resumeScreeningPolicySchema,
} from "@app/shared/resume-screening";
import {
  createDefaultJobDescriptionStructuredConfig,
  parseStoredJobDescriptionStructuredConfig,
} from "@app/db-schema/job-description-structured-config";
import { minimaxVoiceSchema } from "@app/db-schema/minimax-voices";
import type { JsonObject } from "@app/db-schema/json";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "../../lib/db";
import { buildOrderBy, calcTotalPages, makePaginationSchema } from "../../lib/db/pagination";
import type { PaginatedResult, PaginationParams } from "../../lib/db/pagination";
import { serializeDate } from "../../lib/db/serialize";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionEvaluationUpgradeDraft,
  jobDescriptionInterviewer,
  aiInterviewRound,
} from "@app/db-schema/schema";

const jobDescriptionListFiltersSchema = z.object({
  departmentId: z.string().trim().max(120).optional().nullable(),
  interviewerId: z.string().trim().max(120).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  textFilters: listTextFiltersSchema("jobs"),
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
interface JobDescriptionPaginationInput {
  page?: string;
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
}

export type PaginatedJobDescriptionResult = PaginatedResult<JobDescriptionListRecord>;

function parseResumeScreeningPolicy(value: JsonObject | null) {
  if (!value) {
    return createDefaultResumeScreeningPolicy();
  }
  const parsedPolicy = resumeScreeningPolicySchema.safeParse(value);
  return parsedPolicy.success ? parsedPolicy.data : createDefaultResumeScreeningPolicy();
}

function parseStructuredConfig(value: JsonObject | null) {
  if (!value) {
    return createDefaultJobDescriptionStructuredConfig();
  }
  try {
    return parseStoredJobDescriptionStructuredConfig(value);
  } catch {
    return createDefaultJobDescriptionStructuredConfig();
  }
}

function buildWhereConditions({
  organizationId,
  textFilters,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
  recruitingOnly = false,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
  recruitingOnly?: boolean;
}) {
  const conditions: (ReturnType<typeof ilike> | ReturnType<typeof eq>)[] = [
    eq(jobDescription.organizationId, organizationId),
  ];
  if (recruitingOnly) {
    conditions.push(eq(jobDescription.lifecycleStatus, "published"));
  }
  if (search) {
    const searchCond = or(
      ilike(jobDescription.name, `%${search}%`),
      ilike(jobDescription.prompt, `%${search}%`),
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
  const atomic = buildListTextFilterWhere("jobs", textFilters, {
    name: jobDescription.name,
    prompt: jobDescription.prompt,
  });
  if (atomic) {
    conditions.push(atomic);
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
  textFilters,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
  sortBy = "createdAt",
  sortOrder = "desc",
  limit,
  offset,
  recruitingOnly = false,
}: {
  organizationId: string;
  textFilters?: string;
  search?: string;
  departmentIds?: string[];
  interviewerIds?: string[];
  jdIdsForInterviewers?: string[];
  sortBy?: SortColumn;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  recruitingOnly?: boolean;
}) {
  const where = buildWhereConditions({
    departmentIds,
    interviewerIds,
    jdIdsForInterviewers,
    organizationId,
    recruitingOnly,
    search,
    textFilters,
  });

  let query = db
    .select({
      allowCrossDepartmentInterviewers: jobDescription.allowCrossDepartmentInterviewers,
      code: jobDescription.code,
      createdAt: jobDescription.createdAt,
      createdBy: jobDescription.createdBy,
      deductionRuleSetVersion: jobDescription.deductionRuleSetVersion,
      departmentId: jobDescription.departmentId,
      departmentName: department.name,
      description: jobDescription.description,
      evaluationBlueprint: jobDescription.evaluationBlueprint,
      evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
      evaluationBlueprintPreview: jobDescription.evaluationBlueprintPreview,
      evaluationBlueprintPreviewGeneratedAt: jobDescription.evaluationBlueprintPreviewGeneratedAt,
      evaluationBlueprintPreviewHash: jobDescription.evaluationBlueprintPreviewHash,
      evaluationBlueprintPreviewInputHash: jobDescription.evaluationBlueprintPreviewInputHash,
      evaluationBlueprintSchemaVersion: jobDescription.evaluationBlueprintSchemaVersion,
      evaluationMode: jobDescription.evaluationMode,
      evaluationUpgradedAt: jobDescription.evaluationUpgradedAt,
      evaluationUpgradedBy: jobDescription.evaluationUpgradedBy,
      id: jobDescription.id,
      lifecycleStatus: jobDescription.lifecycleStatus,
      name: jobDescription.name,
      presetQuestions: jobDescription.presetQuestions,
      prompt: jobDescription.prompt,
      publishedAt: jobDescription.publishedAt,
      resumeScreeningPolicy: jobDescription.resumeScreeningPolicy,
      resumeScreeningPolicyHash: jobDescription.resumeScreeningPolicyHash,
      resumeScreeningPolicyVersion: jobDescription.resumeScreeningPolicyVersion,
      structuredConfig: jobDescription.structuredConfig,
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
  textFilters,
  search,
  departmentIds,
  interviewerIds,
  jdIdsForInterviewers,
}: {
  organizationId: string;
  textFilters?: string;
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
    textFilters,
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
        voice: minimaxVoiceSchema.parse(row.interviewerVoice),
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
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        inArray(recruitingRecordReadModel.jobDescriptionId, jobDescriptionIds),
        ne(recruitingRecordReadModel.pipelineStage, "closed"),
      ),
    )
    .groupBy(recruitingRecordReadModel.jobDescriptionId);

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

async function loadUpgradeDraftJobIds(jobDescriptionIds: string[]): Promise<Set<string>> {
  if (jobDescriptionIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ jobDescriptionId: jobDescriptionEvaluationUpgradeDraft.jobDescriptionId })
    .from(jobDescriptionEvaluationUpgradeDraft)
    .where(inArray(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, jobDescriptionIds));
  return new Set(rows.map((row) => row.jobDescriptionId));
}

function toJobDescriptionListRecord(
  row: Awaited<ReturnType<typeof listJobDescriptionRows>>[number],
  interviewers: JobDescriptionInterviewerSummary[],
  resumeCount: number,
  hasEvaluationUpgradeDraft: boolean,
): JobDescriptionListRecord {
  const resumeScreeningPolicy = parseResumeScreeningPolicy(row.resumeScreeningPolicy);
  return {
    allowCrossDepartmentInterviewers: row.allowCrossDepartmentInterviewers,
    code: row.code,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    deductionRuleSetVersion: row.deductionRuleSetVersion,
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    description: row.description,
    evaluationBlueprint: row.evaluationBlueprint,
    evaluationBlueprintHash: row.evaluationBlueprintHash,
    evaluationBlueprintPreview: row.evaluationBlueprintPreview,
    evaluationBlueprintPreviewGeneratedAt: row.evaluationBlueprintPreviewGeneratedAt
      ? serializeDate(row.evaluationBlueprintPreviewGeneratedAt)
      : null,
    evaluationBlueprintPreviewHash: row.evaluationBlueprintPreviewHash,
    evaluationBlueprintPreviewInputHash: row.evaluationBlueprintPreviewInputHash,
    evaluationBlueprintSchemaVersion: row.evaluationBlueprintSchemaVersion,
    evaluationMode: row.evaluationMode,
    evaluationUpgradedAt: row.evaluationUpgradedAt ? serializeDate(row.evaluationUpgradedAt) : null,
    evaluationUpgradedBy: row.evaluationUpgradedBy,
    hasEvaluationUpgradeDraft,
    id: row.id,
    interviewerIds: interviewers.map((item) => item.id),
    interviewers,
    lifecycleStatus: row.lifecycleStatus,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    publishedAt: row.publishedAt ? serializeDate(row.publishedAt) : null,
    resumeCount,
    resumeScreeningPolicy,
    resumeScreeningPolicyHash: row.resumeScreeningPolicyHash,
    resumeScreeningPolicyVersion: row.resumeScreeningPolicyVersion,
    structuredConfig: parseStructuredConfig(row.structuredConfig),
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
  textFilters?: string;
  search?: string | null;
  departmentId?: string | null;
  interviewerId?: string | null;
}) {
  const parsed = jobDescriptionListFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return {
      departmentIds: undefined,
      interviewerIds: undefined,
      search: undefined,
      textFilters: undefined,
    };
  }
  return {
    departmentIds: csvToIds(parsed.data.departmentId),
    interviewerIds: csvToIds(parsed.data.interviewerId),
    search: parsed.data.search?.trim() || undefined,
    textFilters: parsed.data.textFilters,
  };
}

export function parseJobDescriptionPagination(
  params?: JobDescriptionPaginationInput,
): JobDescriptionPaginationParams {
  return jobDescriptionPaginationSchema.parse(params ?? {});
}

export async function queryPaginatedJobDescriptions(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: JobDescriptionPaginationInput,
): Promise<PaginatedJobDescriptionResult> {
  const { textFilters, search, departmentIds, interviewerIds } = parseFilters(filters);
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
      textFilters,
    }),
    countJobDescriptionRows({
      departmentIds,
      interviewerIds,
      jdIdsForInterviewers,
      organizationId,
      search,
      textFilters,
    }),
  ]);

  const ids = records.map((record) => record.id);
  const [interviewersMap, resumeCountsMap, upgradeDraftJobIds] = await Promise.all([
    loadInterviewersForJobDescriptions(ids),
    loadResumeCountsForJobDescriptions(ids),
    loadUpgradeDraftJobIds(ids),
  ]);

  return {
    page,
    pageSize,
    records: records.map((record) =>
      toJobDescriptionListRecord(
        record,
        interviewersMap.get(record.id) ?? [],
        resumeCountsMap.get(record.id) ?? 0,
        upgradeDraftJobIds.has(record.id),
      ),
    ),
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function listJobDescriptions(
  organizationId: string,
  filters?: {
    textFilters?: string;
    search?: string | null;
    departmentId?: string | null;
    interviewerId?: string | null;
  },
  pagination?: JobDescriptionPaginationInput,
) {
  return queryPaginatedJobDescriptions(organizationId, filters, pagination);
}

export async function listManagedJobDescriptions(
  organizationId: string,
): Promise<JobDescriptionListRecord[]> {
  const rows = await listJobDescriptionRows({ organizationId, sortBy: "name", sortOrder: "asc" });
  const ids = rows.map((row) => row.id);
  const [interviewersMap, resumeCountsMap, upgradeDraftJobIds] = await Promise.all([
    loadInterviewersForJobDescriptions(ids),
    loadResumeCountsForJobDescriptions(ids),
    loadUpgradeDraftJobIds(ids),
  ]);
  return rows.map((row) =>
    toJobDescriptionListRecord(
      row,
      interviewersMap.get(row.id) ?? [],
      resumeCountsMap.get(row.id) ?? 0,
      upgradeDraftJobIds.has(row.id),
    ),
  );
}

export async function listRecruitingJobDescriptions(
  organizationId: string,
): Promise<JobDescriptionListRecord[]> {
  const rows = await listJobDescriptionRows({
    organizationId,
    recruitingOnly: true,
    sortBy: "name",
    sortOrder: "asc",
  });
  const ids = rows.map((row) => row.id);
  const [interviewersMap, resumeCountsMap, upgradeDraftJobIds] = await Promise.all([
    loadInterviewersForJobDescriptions(ids),
    loadResumeCountsForJobDescriptions(ids),
    loadUpgradeDraftJobIds(ids),
  ]);
  return rows.map((row) =>
    toJobDescriptionListRecord(
      row,
      interviewersMap.get(row.id) ?? [],
      resumeCountsMap.get(row.id) ?? 0,
      upgradeDraftJobIds.has(row.id),
    ),
  );
}

export async function fetchPublishedJobDescriptionsByCodes(
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
        eq(jobDescription.lifecycleStatus, "published"),
        inArray(jobDescription.code, normalizedCodes),
      ),
    );
  return rows.flatMap((row) => (row.code ? [{ code: row.code, id: row.id }] : []));
}

/**
 * 校验给定 ids 全部存在于 jobDescription 表。空数组视作合法。
 * Validate that every id in `ids` exists in jobDescription. Empty input is valid.
 */
export async function managedJobDescriptionIdsExist(
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

export async function recruitingJobDescriptionIdsExist(
  ids: string[],
  organizationId: string,
): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  const rows = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(
      and(
        inArray(jobDescription.id, ids),
        eq(jobDescription.organizationId, organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    );
  return rows.length === new Set(ids).size;
}

export async function loadManagedJobDescriptionById(
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
  const upgradeDraftJobIds = await loadUpgradeDraftJobIds([id]);
  const interviewers = interviewersMap.get(id) ?? [];
  // eslint-disable-next-line no-use-before-define -- kept near public load functions for readability.
  return serializeJobDescription(
    row,
    interviewers.map((item) => item.id),
    upgradeDraftJobIds.has(id),
  );
}

export async function loadRecruitingJobDescriptionById(
  organizationId: string,
  id: string,
): Promise<JobDescriptionRecord | null> {
  const record = await loadManagedJobDescriptionById(organizationId, id);
  return record?.lifecycleStatus === "published" ? record : null;
}

/** @deprecated Choose the explicit management or recruiting loader. */
export const listAllJobDescriptions = listManagedJobDescriptions;
/** @deprecated Choose the explicit management or recruiting loader. */
export const loadJobDescriptionById = loadManagedJobDescriptionById;
/** @deprecated Choose the explicit management or recruiting existence check. */
export const jobDescriptionIdsExist = managedJobDescriptionIdsExist;
/** @deprecated Recruiting ingestion must use published jobs only. */
export const fetchJobDescriptionsByCodes = fetchPublishedJobDescriptionsByCodes;

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
      count: count(recruitingRecordReadModel.id),
      id: jobDescription.id,
      name: jobDescription.name,
    })
    .from(jobDescription)
    .leftJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(recruitingRecordReadModel.organizationId, organizationId),
        ne(recruitingRecordReadModel.pipelineStage, "closed"),
      ),
    )
    .where(eq(jobDescription.organizationId, organizationId))
    .groupBy(jobDescription.id, jobDescription.name)
    .orderBy(desc(count(recruitingRecordReadModel.id)), asc(jobDescription.name))
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
    sql<number>`COUNT(${aiInterviewRound.id}) FILTER (WHERE ${aiInterviewRound.status} = 'completed')`.mapWith(
      Number,
    );
  const total = sql<number>`COUNT(${aiInterviewRound.id})`.mapWith(Number);

  const rows = await db
    .select({
      done,
      id: jobDescription.id,
      name: jobDescription.name,
      total,
    })
    .from(jobDescription)
    .innerJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .innerJoin(
      aiInterviewRound,
      eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
    )
    .where(
      and(
        eq(jobDescription.organizationId, organizationId),
        ne(recruitingRecordReadModel.pipelineStage, "closed"),
      ),
    )
    .groupBy(jobDescription.id, jobDescription.name)
    .having(sql`COUNT(${aiInterviewRound.id}) > 0`)
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
      activeCandidates: sql<number>`COUNT(DISTINCT ${recruitingRecordReadModel.id})`.mapWith(
        Number,
      ),
      id: interviewer.id,
      name: interviewer.name,
    })
    .from(interviewer)
    .innerJoin(
      jobDescriptionInterviewer,
      eq(jobDescriptionInterviewer.interviewerId, interviewer.id),
    )
    .innerJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescriptionInterviewer.jobDescriptionId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
        inArray(recruitingRecordReadModel.pipelineStage, [
          "ai_interview",
          "human_interview",
          "offer",
        ]),
      ),
    )
    .where(eq(interviewer.organizationId, organizationId))
    .groupBy(interviewer.id, interviewer.name)
    .having(sql`COUNT(DISTINCT ${recruitingRecordReadModel.id}) > 0`)
    .orderBy(desc(sql`COUNT(DISTINCT ${recruitingRecordReadModel.id})`), asc(interviewer.name))
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
  hasEvaluationUpgradeDraft = false,
): JobDescriptionRecord {
  const resumeScreeningPolicy = parseResumeScreeningPolicy(row.resumeScreeningPolicy);
  return {
    allowCrossDepartmentInterviewers: row.allowCrossDepartmentInterviewers,
    code: row.code,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    deductionRuleSetVersion: row.deductionRuleSetVersion,
    departmentId: row.departmentId,
    description: row.description,
    evaluationBlueprint: row.evaluationBlueprint,
    evaluationBlueprintHash: row.evaluationBlueprintHash,
    evaluationBlueprintPreview: row.evaluationBlueprintPreview,
    evaluationBlueprintPreviewGeneratedAt: row.evaluationBlueprintPreviewGeneratedAt
      ? serializeDate(row.evaluationBlueprintPreviewGeneratedAt)
      : null,
    evaluationBlueprintPreviewHash: row.evaluationBlueprintPreviewHash,
    evaluationBlueprintPreviewInputHash: row.evaluationBlueprintPreviewInputHash,
    evaluationBlueprintSchemaVersion: row.evaluationBlueprintSchemaVersion,
    evaluationMode: row.evaluationMode,
    evaluationUpgradedAt: row.evaluationUpgradedAt ? serializeDate(row.evaluationUpgradedAt) : null,
    evaluationUpgradedBy: row.evaluationUpgradedBy,
    hasEvaluationUpgradeDraft,
    id: row.id,
    interviewerIds,
    lifecycleStatus: row.lifecycleStatus,
    name: row.name,
    presetQuestions: row.presetQuestions ?? [],
    prompt: row.prompt,
    publishedAt: row.publishedAt ? serializeDate(row.publishedAt) : null,
    resumeScreeningPolicy,
    resumeScreeningPolicyHash: row.resumeScreeningPolicyHash,
    resumeScreeningPolicyVersion: row.resumeScreeningPolicyVersion,
    structuredConfig: parseStructuredConfig(row.structuredConfig),
    updatedAt: serializeDate(row.updatedAt),
  };
}
