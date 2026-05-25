import "server-only";

import { and, arrayContains, count, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { buildOrderBy, calcTotalPages, makePaginationSchema } from "@/lib/server/db/pagination";
import { serializeDate } from "@/lib/server/db/serialize";
import {
  jobDescription,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import {
  candidateOutcomeValues,
  pipelineStageValues,
  studioInterviewStatusMeta,
} from "@arc/db-schema/studio-interviews";
import type {
  CandidateOutcome,
  PipelineStage,
  StudioInterviewStatus,
} from "@arc/db-schema/studio-interviews";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
  ResumeLibraryListRecord,
  ResumeStageProgress,
} from "@/lib/shared/studio-resumes";
import { normalizeSkill } from "./skills";

const SORT_COLUMNS = ["createdAt", "candidateName", "updatedAt"] as const;

const ORDER_COLUMNS = {
  candidateName: studioInterview.candidateName,
  createdAt: studioInterview.createdAt,
  updatedAt: studioInterview.updatedAt,
} as const;

const paginationSchema = makePaginationSchema(SORT_COLUMNS);

// 允许调用方原样传入 CSV 拆分结果（可能含空串）；buildWhere 内统一 trim + drop blank。
// Accept caller-supplied arrays that may contain empty/whitespace entries —
// buildWhere drops blanks before using them so we don't need to error here.
const filtersSchema = z.object({
  jobDescriptionIds: z.array(z.string()).max(50).optional().nullable(),
  outcomes: z.array(z.string()).max(10).optional().nullable(),
  pipelineStages: z.array(z.string()).max(10).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  skills: z.array(z.string()).max(20).optional().nullable(),
  // @deprecated 旧 status 过滤，由 pipelineStages + outcomes 取代；保留以兼容旧调用方。
  statuses: z.array(z.string()).max(10).optional().nullable(),
});

type Pagination = z.infer<typeof paginationSchema>;
type Filters = z.infer<typeof filtersSchema>;

// 把单字段 filter 编译成 conditions 数组，挪出 buildWhere 拆复杂度。
// Filter compilation helpers split out of buildWhere to keep its complexity low.

function buildSearchCondition(search: string | null | undefined) {
  const trimmed = search?.trim();
  if (!trimmed) {
    return null;
  }
  const like = `%${trimmed}%`;
  return (
    or(
      ilike(studioInterview.candidateName, like),
      ilike(studioInterview.candidateEmail, like),
      ilike(studioInterview.candidatePhone, like),
      ilike(studioInterview.resumeFileName, like),
      ilike(studioInterview.targetRole, like),
    ) ?? null
  );
}

// 输入按存储归一化规则同样处理后再 dedupe；空字符串丢弃。
// candidate 行上的 skills_normalized 列已经是 lowercase + 折叠空白，所以用户输入
// 也要走同一套归一化函数。AND（交集）语义直接用 PG 的 `@>` 包含运算符——一句话搞定，
// GIN 索引直接命中，无需 EXISTS / GROUP BY / HAVING 三层嵌套。
//
// Same normalization as the write path. AND (intersection) semantics are
// expressed by PG's `@>` (contains-all) operator over the GIN-indexed
// skills_normalized array — single index lookup, no EXISTS / GROUP BY /
// HAVING gymnastics required.
function buildSkillsCondition(skills: string[] | null | undefined) {
  const normalized = [
    ...new Set((skills ?? []).map((s) => normalizeSkill(s).normalized).filter((s) => s.length > 0)),
  ];
  return normalized.length > 0 ? arrayContains(studioInterview.skillsNormalized, normalized) : null;
}

function buildJdIdsCondition(jdIds: string[] | null | undefined) {
  const filtered = jdIds?.filter((id) => id.trim().length > 0) ?? [];
  return filtered.length > 0 ? inArray(studioInterview.jobDescriptionId, filtered) : null;
}

function buildStatusesCondition(statuses: string[] | null | undefined) {
  const filtered = (statuses ?? []).filter((s): s is StudioInterviewStatus =>
    Object.hasOwn(studioInterviewStatusMeta, s),
  );
  return filtered.length > 0 ? inArray(studioInterview.status, filtered) : null;
}

function buildStagesCondition(stages: string[] | null | undefined) {
  const filtered = (stages ?? []).filter((s): s is PipelineStage =>
    pipelineStageValues.includes(s as PipelineStage),
  );
  return filtered.length > 0 ? inArray(studioInterview.pipelineStage, filtered) : null;
}

function buildOutcomesCondition(outcomes: string[] | null | undefined) {
  const filtered = (outcomes ?? []).filter((o): o is CandidateOutcome =>
    candidateOutcomeValues.includes(o as CandidateOutcome),
  );
  return filtered.length > 0 ? inArray(studioInterview.outcome, filtered) : null;
}

function buildWhere(organizationId: string, filters?: Filters) {
  const conditions = [
    eq(studioInterview.organizationId, organizationId),
    buildSearchCondition(filters?.search),
    buildSkillsCondition(filters?.skills),
    buildJdIdsCondition(filters?.jobDescriptionIds),
    buildStatusesCondition(filters?.statuses),
    buildStagesCondition(filters?.pipelineStages),
    buildOutcomesCondition(filters?.outcomes),
  ].filter((c) => c !== null);
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

// 子查询：该候选人是否已有任意 AI 面试轮次。
// Subquery: whether this candidate already has any AI interview round.
const hasInterviewRoundsSql = exists(
  db
    .select({ one: studioInterviewSchedule.id })
    .from(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
);

// 派生「面试进度」：单条 SELECT 同时聚合 3 个子表的状态：
//   - aiInterview: studio_interview_schedule（AI 多轮）
//   - humanInterview: studio_human_interview_round（真人复面多轮）
//   - offer: studio_offer_draft（多版本 Offer）
// 每个子结构都是「无数据时返回 null」，让 UI 用 `?.` 做空守卫即可。
//
// One SELECT aggregates progress across all three subtables; each sub-block
// returns null when empty so the UI can use optional chaining everywhere.
const stageProgressSql = sql<ResumeStageProgress>`(
  SELECT json_build_object(
    'aiInterview', (
      SELECT json_build_object(
        'totalRounds', COUNT(*)::int,
        'completedRounds', COUNT(*) FILTER (WHERE sis.status = 'completed')::int,
        'hasStarted', COALESCE(BOOL_OR(sis.status <> 'pending'), false),
        'activeRound', (
          SELECT json_build_object(
            'sortOrder', sis2.sort_order,
            'roundLabel', sis2.round_label,
            'status', sis2.status
          )
          FROM studio_interview_schedule sis2
          WHERE sis2.interview_record_id = ${studioInterview.id}
            AND sis2.status <> 'completed'
          ORDER BY sis2.sort_order ASC
          LIMIT 1
        )
      )
      FROM studio_interview_schedule sis
      WHERE sis.interview_record_id = ${studioInterview.id}
      HAVING COUNT(*) > 0
    ),
    'humanInterview', (
      SELECT json_build_object(
        -- 不计 cancelled 轮次，避免被取消的轮次干扰统计。
        -- Exclude cancelled rounds from the counts.
        'totalRounds', COUNT(*) FILTER (WHERE shr.status <> 'cancelled')::int,
        'completedRounds', COUNT(*) FILTER (WHERE shr.status = 'completed')::int,
        'passedRounds', COUNT(*) FILTER (WHERE shr.status = 'completed' AND shr.outcome = 'pass')::int,
        'failedRounds', COUNT(*) FILTER (WHERE shr.status = 'completed' AND shr.outcome = 'fail')::int,
        'activeRound', (
          SELECT json_build_object(
            'id', shr2.id,
            'sortOrder', shr2.sort_order,
            'label', shr2.label,
            'status', shr2.status,
            'outcome', shr2.outcome,
            'scheduledAt', shr2.scheduled_at
          )
          FROM studio_human_interview_round shr2
          WHERE shr2.interview_record_id = ${studioInterview.id}
            AND shr2.status = 'pending'
          ORDER BY shr2.sort_order ASC
          LIMIT 1
        )
      )
      FROM studio_human_interview_round shr
      WHERE shr.interview_record_id = ${studioInterview.id}
      HAVING COUNT(*) FILTER (WHERE shr.status <> 'cancelled') > 0
    ),
    'offer', (
      SELECT json_build_object(
        'totalVersions', COUNT(*) FILTER (WHERE sod.status <> 'superseded')::int,
        'latestDraft', (
          SELECT json_build_object(
            'id', sod2.id,
            'version', sod2.version,
            'status', sod2.status,
            'sentAt', sod2.sent_at,
            'responseAt', sod2.response_at
          )
          FROM studio_offer_draft sod2
          WHERE sod2.interview_record_id = ${studioInterview.id}
            AND sod2.status <> 'superseded'
          ORDER BY sod2.version DESC
          LIMIT 1
        )
      )
      FROM studio_offer_draft sod
      WHERE sod.interview_record_id = ${studioInterview.id}
      HAVING COUNT(*) FILTER (WHERE sod.status <> 'superseded') > 0
    )
  )
)`;

// 中文：「最近面试时间」= 跟简历详情面板里面试报告 accordion 头部展示的同一个
// 时间字段（report.startedAt ?? report.createdAt），过滤条件也对齐：只看 status
// 是 'completed' / 'done' 的 conversation（即 UI 上挂"已完成"徽章那批）。
// 单个 correlated MAX 子查询，走 interview_conversation_record_idx 索引，每行
// 只在该候选人对应的极小数据集里筛 status + 取 MAX，开销可忽略。
// English: matches the timestamp shown next to the "已完成" badge in the
// interview-report accordion (started_at, with created_at fallback). Filter
// status to the completed set so unfinished sessions don't surface. Single
// correlated MAX over the per-record index — minimal cost per row.
const lastInterviewAtSql = sql<Date | null>`(
  SELECT MAX(COALESCE(ic.started_at, ic.created_at))
    FROM interview_conversation ic
    WHERE ic.interview_record_id = ${studioInterview.id}
      AND ic.status IN ('completed', 'done')
)`;

const SELECTED_COLUMNS = {
  candidateEmail: studioInterview.candidateEmail,
  candidateExpectationsMeta: studioInterview.candidateExpectationsMeta,
  candidateName: studioInterview.candidateName,
  candidatePhone: studioInterview.candidatePhone,
  closedAt: studioInterview.closedAt,
  closedMeta: studioInterview.closedMeta,
  closedReason: studioInterview.closedReason,
  createdAt: studioInterview.createdAt,
  createdBy: studioInterview.createdBy,
  creatorImage: user.image,
  creatorName: user.name,
  creatorOrganizationName: user.feishuTenantName,
  hasInterviewRounds: hasInterviewRoundsSql,
  humanInterviewScheduledAt: studioInterview.humanInterviewScheduledAt,
  humanInterviewerId: studioInterview.humanInterviewerId,
  id: studioInterview.id,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  lastInterviewAt: lastInterviewAtSql,
  notes: studioInterview.notes,
  offerAcceptedAt: studioInterview.offerAcceptedAt,
  offerSentAt: studioInterview.offerSentAt,
  outcome: studioInterview.outcome,
  pipelineStage: studioInterview.pipelineStage,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeFileName: studioInterview.resumeFileName,
  resumeStorageKey: studioInterview.resumeStorageKey,
  stageProgress: stageProgressSql,
  status: studioInterview.status,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterview.updatedAt,
  writtenTestScheduledAt: studioInterview.writtenTestScheduledAt,
  writtenTestScore: studioInterview.writtenTestScore,
} as const;

type Row = Awaited<ReturnType<typeof selectRows>>[number];

function selectRows({
  organizationId,
  filters,
  pagination,
}: {
  organizationId: string;
  filters?: Filters;
  pagination?: Partial<Pagination>;
}) {
  const { page, pageSize, sortBy, sortOrder } = paginationSchema.parse(pagination ?? {});
  const offset = (page - 1) * pageSize;

  return db
    .select(SELECTED_COLUMNS)
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(buildWhere(organizationId, filters))
    .orderBy(buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder))
    .limit(pageSize)
    .offset(offset);
}

// 兜底默认值：候选人完全没有任何子表数据时返回（虽然聚合 SQL 总会返回一个对象，
// 但 row.stageProgress 可能是 null —— 兜一手让下游永远拿到完整 shape）。
// Default fallback when the aggregation row returns null altogether.
const EMPTY_STAGE_PROGRESS: ResumeStageProgress = {
  aiInterview: null,
  humanInterview: null,
  offer: null,
};

function toRecord(row: Row): ResumeLibraryListRecord {
  return {
    candidateEmail: row.candidateEmail,
    candidateExpectationsMeta: row.candidateExpectationsMeta,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    closedAt: serializeDate(row.closedAt),
    closedMeta: row.closedMeta,
    closedReason: row.closedReason,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    hasInterviewRounds: Boolean(row.hasInterviewRounds),
    hasResumeFile: Boolean(row.resumeStorageKey),
    humanInterviewScheduledAt: serializeDate(row.humanInterviewScheduledAt),
    humanInterviewerId: row.humanInterviewerId,
    id: row.id,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    lastInterviewAt: serializeDate(row.lastInterviewAt),
    notes: row.notes,
    offerAcceptedAt: serializeDate(row.offerAcceptedAt),
    offerSentAt: serializeDate(row.offerSentAt),
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    stageProgress: row.stageProgress ?? EMPTY_STAGE_PROGRESS,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt),
    writtenTestScheduledAt: serializeDate(row.writtenTestScheduledAt),
    writtenTestScore: row.writtenTestScore,
  };
}

export async function queryPaginatedResumeRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
    statuses?: string[] | null;
    pipelineStages?: string[] | null;
    outcomes?: string[] | null;
  },
  pagination?: Record<string, unknown>,
): Promise<PaginatedResumeLibraryResult> {
  const parsedFilters = filtersSchema.parse(filters ?? {});
  const parsedPagination = paginationSchema.parse(pagination ?? {});
  const where = buildWhere(organizationId, parsedFilters);

  const [rows, [countRow]] = await Promise.all([
    selectRows({
      filters: parsedFilters,
      organizationId,
      pagination: parsedPagination,
    }),
    db.select({ count: count() }).from(studioInterview).where(where),
  ]);

  const total = countRow?.count ?? 0;
  return {
    page: parsedPagination.page,
    pageSize: parsedPagination.pageSize,
    records: rows.map(toRecord),
    total,
    totalPages: calcTotalPages(total, parsedPagination.pageSize),
  };
}

/** Cached version for Server Components.
 * 供 Server Component 使用的缓存版本，自动标记 "studio-resumes" cache tag。
 */
export function listResumeRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
    statuses?: string[] | null;
    pipelineStages?: string[] | null;
    outcomes?: string[] | null;
  },
  pagination?: Partial<Pagination>,
) {
  return queryPaginatedResumeRecords(organizationId, filters, pagination);
}

export async function loadResumeDetail(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
      interviewQuestions: studioInterview.interviewQuestions,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
    .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { resumeProfile, interviewQuestions, ...rest } = row;
  return {
    ...toRecord(rest),
    interviewQuestions: interviewQuestions ?? [],
    resumeProfile,
  };
}
