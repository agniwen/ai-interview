import { and, arrayContains, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import {
  department,
  interviewConversation,
  jobDescription,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  studioOfferDraft,
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
} from "@arc/shared/studio-resumes";
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
  creatorIds: z.array(z.string()).max(50).optional().nullable(),
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

function buildCreatorIdsCondition(creatorIds: string[] | null | undefined) {
  const filtered = creatorIds?.filter((id) => id.trim().length > 0) ?? [];
  return filtered.length > 0 ? inArray(studioInterview.createdBy, filtered) : null;
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
    buildCreatorIdsCondition(filters?.creatorIds),
    buildStatusesCondition(filters?.statuses),
    buildStagesCondition(filters?.pipelineStages),
    buildOutcomesCondition(filters?.outcomes),
  ].filter((c) => c !== null);
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

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
  humanInterviewScheduledAt: studioInterview.humanInterviewScheduledAt,
  humanInterviewerId: studioInterview.humanInterviewerId,
  id: studioInterview.id,
  jobDescriptionDepartmentName: department.name,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  notes: studioInterview.notes,
  offerAcceptedAt: studioInterview.offerAcceptedAt,
  offerSentAt: studioInterview.offerSentAt,
  outcome: studioInterview.outcome,
  pipelineStage: studioInterview.pipelineStage,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeFileName: studioInterview.resumeFileName,
  resumeParseError: studioInterview.resumeParseError,
  resumeParseStatus: studioInterview.resumeParseStatus,
  resumeParsedAt: studioInterview.resumeParsedAt,
  resumeStorageKey: studioInterview.resumeStorageKey,
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
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(department.organizationId, studioInterview.organizationId),
      ),
    )
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

interface ResumeDerivedFields {
  hasInterviewRounds: boolean;
  lastInterviewAt: string | null;
  stageProgress: ResumeStageProgress;
}

const EMPTY_DERIVED_FIELDS: ResumeDerivedFields = {
  hasInterviewRounds: false,
  lastInterviewAt: null,
  stageProgress: EMPTY_STAGE_PROGRESS,
};

function serializeStageProgressTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

// 批量组装 4 类派生字段，集中在一个函数里避免在分页行上重复 correlated subquery。
// Batch-assembles 4 derived branches in one place to avoid per-row correlated subqueries.
// oxlint-disable-next-line complexity
async function loadResumeDerivedFields(
  candidateIds: string[],
): Promise<Map<string, ResumeDerivedFields>> {
  const ids = [...new Set(candidateIds.filter(Boolean))];
  const result = new Map<string, ResumeDerivedFields>();
  for (const id of ids) {
    result.set(id, {
      hasInterviewRounds: false,
      lastInterviewAt: null,
      stageProgress: { ...EMPTY_STAGE_PROGRESS },
    });
  }
  if (ids.length === 0) {
    return result;
  }

  const [aiRows, humanRows, offerRows, lastInterviewRows] = await Promise.all([
    db
      .select({
        interviewRecordId: studioInterviewSchedule.interviewRecordId,
        roundLabel: studioInterviewSchedule.roundLabel,
        sortOrder: studioInterviewSchedule.sortOrder,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .where(inArray(studioInterviewSchedule.interviewRecordId, ids))
      .orderBy(
        asc(studioInterviewSchedule.interviewRecordId),
        asc(studioInterviewSchedule.sortOrder),
      ),
    db
      .select({
        id: studioHumanInterviewRound.id,
        interviewRecordId: studioHumanInterviewRound.interviewRecordId,
        label: studioHumanInterviewRound.label,
        outcome: studioHumanInterviewRound.outcome,
        scheduledAt: studioHumanInterviewRound.scheduledAt,
        sortOrder: studioHumanInterviewRound.sortOrder,
        status: studioHumanInterviewRound.status,
      })
      .from(studioHumanInterviewRound)
      .where(inArray(studioHumanInterviewRound.interviewRecordId, ids))
      .orderBy(
        asc(studioHumanInterviewRound.interviewRecordId),
        asc(studioHumanInterviewRound.sortOrder),
      ),
    db
      .select({
        id: studioOfferDraft.id,
        interviewRecordId: studioOfferDraft.interviewRecordId,
        responseAt: studioOfferDraft.responseAt,
        sentAt: studioOfferDraft.sentAt,
        status: studioOfferDraft.status,
        version: studioOfferDraft.version,
      })
      .from(studioOfferDraft)
      .where(inArray(studioOfferDraft.interviewRecordId, ids))
      .orderBy(asc(studioOfferDraft.interviewRecordId), asc(studioOfferDraft.version)),
    db
      .select({
        interviewRecordId: interviewConversation.interviewRecordId,
        lastInterviewAt:
          sql<Date | null>`MAX(COALESCE(${interviewConversation.startedAt}, ${interviewConversation.createdAt}))`.as(
            "last_interview_at",
          ),
      })
      .from(interviewConversation)
      .where(
        and(
          inArray(interviewConversation.interviewRecordId, ids),
          inArray(interviewConversation.status, ["completed", "done"]),
        ),
      )
      .groupBy(interviewConversation.interviewRecordId),
  ]);

  const aiByCandidate = new Map<string, (typeof aiRows)[number][]>();
  for (const row of aiRows) {
    const current = aiByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    aiByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of aiByCandidate) {
    const derived = result.get(id);
    if (!derived || rows.length === 0) {
      continue;
    }
    const activeRound = rows.find((row) => row.status !== "completed") ?? null;
    derived.hasInterviewRounds = true;
    derived.stageProgress.aiInterview = {
      activeRound: activeRound
        ? {
            roundLabel: activeRound.roundLabel,
            sortOrder: activeRound.sortOrder,
            status: activeRound.status,
          }
        : null,
      completedRounds: rows.filter((row) => row.status === "completed").length,
      hasStarted: rows.some((row) => row.status !== "pending"),
      totalRounds: rows.length,
    };
  }

  const humanByCandidate = new Map<string, (typeof humanRows)[number][]>();
  for (const row of humanRows) {
    const current = humanByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    humanByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of humanByCandidate) {
    const derived = result.get(id);
    const countedRows = rows.filter((row) => row.status !== "cancelled");
    if (!derived || countedRows.length === 0) {
      continue;
    }
    const activeRound = rows.find((row) => row.status === "pending") ?? null;
    derived.stageProgress.humanInterview = {
      activeRound: activeRound
        ? {
            id: activeRound.id,
            label: activeRound.label,
            outcome: activeRound.outcome,
            scheduledAt: serializeStageProgressTimestamp(activeRound.scheduledAt),
            sortOrder: activeRound.sortOrder,
            status: activeRound.status,
          }
        : null,
      completedRounds: countedRows.filter((row) => row.status === "completed").length,
      failedRounds: countedRows.filter(
        (row) => row.status === "completed" && row.outcome === "fail",
      ).length,
      passedRounds: countedRows.filter(
        (row) => row.status === "completed" && row.outcome === "pass",
      ).length,
      totalRounds: countedRows.length,
    };
  }

  const offersByCandidate = new Map<string, (typeof offerRows)[number][]>();
  for (const row of offerRows) {
    if (row.status === "superseded") {
      continue;
    }
    const current = offersByCandidate.get(row.interviewRecordId) ?? [];
    current.push(row);
    offersByCandidate.set(row.interviewRecordId, current);
  }
  for (const [id, rows] of offersByCandidate) {
    const derived = result.get(id);
    if (!derived || rows.length === 0) {
      continue;
    }
    const latestDraft = rows.toSorted((a, b) => b.version - a.version)[0] ?? null;
    derived.stageProgress.offer = {
      latestDraft: latestDraft
        ? {
            id: latestDraft.id,
            responseAt: serializeStageProgressTimestamp(latestDraft.responseAt),
            sentAt: serializeStageProgressTimestamp(latestDraft.sentAt),
            status: latestDraft.status,
            version: latestDraft.version,
          }
        : null,
      totalVersions: rows.length,
    };
  }

  for (const row of lastInterviewRows) {
    if (!row.interviewRecordId) {
      continue;
    }
    const derived = result.get(row.interviewRecordId);
    if (derived) {
      derived.lastInterviewAt = serializeStageProgressTimestamp(row.lastInterviewAt);
    }
  }

  return result;
}

function toRecord(row: Row, derived?: ResumeDerivedFields): ResumeLibraryListRecord {
  const resolvedDerived = derived ?? EMPTY_DERIVED_FIELDS;
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
    hasInterviewRounds: resolvedDerived.hasInterviewRounds,
    hasResumeFile: Boolean(row.resumeStorageKey),
    humanInterviewScheduledAt: serializeDate(row.humanInterviewScheduledAt),
    humanInterviewerId: row.humanInterviewerId,
    id: row.id,
    jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    lastInterviewAt: resolvedDerived.lastInterviewAt,
    notes: row.notes,
    offerAcceptedAt: serializeDate(row.offerAcceptedAt),
    offerSentAt: serializeDate(row.offerSentAt),
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeParseError: row.resumeParseError,
    resumeParseStatus: row.resumeParseStatus,
    resumeParsedAt: serializeDate(row.resumeParsedAt),
    stageProgress: resolvedDerived.stageProgress,
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
    creatorIds?: string[] | null;
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

  const derivedFields = await loadResumeDerivedFields(rows.map((row) => row.id));
  const total = countRow?.count ?? 0;
  return {
    page: parsedPagination.page,
    pageSize: parsedPagination.pageSize,
    records: rows.map((row) => toRecord(row, derivedFields.get(row.id))),
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
    creatorIds?: string[] | null;
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
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(department.organizationId, studioInterview.organizationId),
      ),
    )
    .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, organizationId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { resumeProfile, interviewQuestions, ...rest } = row;
  const derivedFields = await loadResumeDerivedFields([rest.id]);
  return {
    ...toRecord(rest, derivedFields.get(rest.id)),
    interviewQuestions: interviewQuestions ?? [],
    resumeProfile,
  };
}
