import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
// Round-keyed DAO for AI 面试 列表与详情。
// 主查询：FROM studio_interview_schedule LEFT JOIN studio_interview
// LEFT JOIN job_description LEFT JOIN user LEFT JOIN (conversations 是否存在) AS hasReport。
//
// Round-keyed DAO. Drives off studio_interview_schedule and joins back to
// the candidate row, JD, creator, and a "has at least one conversation" flag.

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "../../../../../../lib/server/db/index";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "../../../../../../lib/server/db/pagination";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import { intersectRequestedCreatorIds } from "../../../../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import {
  department,
  aiInterviewConversation,
  jobDescription,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import { buildInterviewLink } from "@app/shared/interview/interview-record";
import { deriveJdRequiredSkills } from "@app/shared/resume-screening";
import {
  buildCandidateInterviewFeedback,
  scheduleEntryStatusSchema,
} from "@app/db-schema/studio-interviews";
import type { ScheduleEntryStatus } from "@app/db-schema/studio-interviews";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@app/shared/studio-interview-rounds";
import { loadStudioCandidate } from "./studio-interviews";
import { loadRoundFeishuEvaluationDocuments } from "./evaluation-documents";

const SORT_COLUMNS = ["scheduledAt", "createdAt", "candidateName", "roundLabel"] as const;

const ORDER_COLUMNS = {
  candidateName: recruitingRecordReadModel.candidateName,
  createdAt: aiInterviewRound.createdAt,
  roundLabel: aiInterviewRound.roundLabel,
  scheduledAt: aiInterviewRound.scheduledAt,
} as const;

const roundsPaginationSchema = makePaginationSchema(SORT_COLUMNS, {
  defaultSortBy: "createdAt",
});
const roundsPaginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});
type RoundsPaginationInput = z.input<typeof roundsPaginationInputSchema>;

function parsePagination(params?: RoundsPaginationInput) {
  return roundsPaginationSchema.parse(roundsPaginationInputSchema.parse(params ?? {}));
}

function csvToList(value?: string | null): string[] | undefined {
  if (!value) {
    return;
  }
  const items = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseStatusFilter(value?: string | null): ScheduleEntryStatus[] | undefined {
  const items = csvToList(value);
  if (!items) {
    return;
  }
  const valid = items.flatMap((item) => {
    const parsed = scheduleEntryStatusSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return valid.length > 0 ? valid : undefined;
}

function buildWhere(
  organizationId: string,
  filters?: {
    creatorIds?: string[];
    forceEmpty?: boolean;
    textFilters?: string;
    search?: string;
    statuses?: ScheduleEntryStatus[];
  },
) {
  if (filters?.forceEmpty) {
    return sql`false`;
  }
  const conditions: ReturnType<typeof eq | typeof or | typeof inArray>[] = [
    eq(aiInterviewRound.organizationId, organizationId),
  ];
  if (filters?.search) {
    const term = `%${filters.search}%`;
    const searchOr = or(
      ilike(recruitingRecordReadModel.candidateName, term),
      ilike(recruitingRecordReadModel.candidateEmail, term),
      ilike(recruitingRecordReadModel.targetRole, term),
      ilike(recruitingRecordReadModel.resumeFileName, term),
      ilike(aiInterviewRound.roundLabel, term),
    );
    if (searchOr) {
      conditions.push(searchOr);
    }
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(aiInterviewRound.status, filters.statuses));
  }
  if (filters?.creatorIds && filters.creatorIds.length > 0) {
    conditions.push(inArray(aiInterviewRound.createdBy, filters.creatorIds));
  }
  return and(
    ...conditions,
    buildListTextFilterWhere("interviews", filters?.textFilters, {
      candidateName: recruitingRecordReadModel.candidateName,
      email: recruitingRecordReadModel.candidateEmail,
      resumeFileName: recruitingRecordReadModel.resumeFileName,
      targetRole: recruitingRecordReadModel.targetRole,
      title: aiInterviewRound.roundLabel,
    }),
  );
}

function serializeRoundDerivedTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

interface RoundDerivedFields {
  hasReport: boolean;
  lastInterviewAt: string | null;
}

async function loadRoundDerivedFields(
  roundIds: string[],
): Promise<Map<string, RoundDerivedFields>> {
  const ids = uniq(roundIds.filter(Boolean));
  const result = new Map<string, RoundDerivedFields>();
  for (const id of ids) {
    result.set(id, { hasReport: false, lastInterviewAt: null });
  }
  if (ids.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      lastInterviewAt: sql<
        Date | string | null
      >`MAX(COALESCE(${aiInterviewConversation.startedAt}, ${aiInterviewConversation.createdAt}))`.as(
        "last_interview_at",
      ),
      reportCount: count(),
      scheduleEntryId: aiInterviewConversation.aiRoundId,
    })
    .from(aiInterviewConversation)
    .where(inArray(aiInterviewConversation.aiRoundId, ids))
    .groupBy(aiInterviewConversation.aiRoundId);

  for (const row of rows) {
    if (!row.scheduleEntryId) {
      continue;
    }
    result.set(row.scheduleEntryId, {
      hasReport: row.reportCount > 0,
      lastInterviewAt: serializeRoundDerivedTimestamp(row.lastInterviewAt),
    });
  }

  return result;
}

async function loadRoundListDerivedFields(rows: { id: string }[], organizationId: string) {
  const roundIds = rows.map((row) => row.id);
  const [byRoundId, evaluationDocumentsByRoundId] = await Promise.all([
    loadRoundDerivedFields(roundIds),
    loadRoundFeishuEvaluationDocuments(roundIds, organizationId),
  ]);
  return { byRoundId, evaluationDocumentsByRoundId };
}

export async function queryPaginatedInterviewRounds(
  organizationId: string,
  filters?: {
    creatorIds?: string[] | null;
    textFilters?: string;
    search?: string | null;
    status?: string | null;
  },
  pagination?: RoundsPaginationInput,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<PaginatedStudioInterviewRoundsResult> {
  const requestedCreatorIds =
    filters?.creatorIds?.filter((id) => id.trim().length > 0) || undefined;
  const scopedCreatorIds = visibilityScope
    ? intersectRequestedCreatorIds(requestedCreatorIds, visibilityScope)
    : requestedCreatorIds;
  const search = filters?.search?.trim() || undefined;
  const statuses = parseStatusFilter(filters?.status);
  const { page, pageSize, sortBy, sortOrder } = parsePagination(pagination);
  const offset = (page - 1) * pageSize;
  const where = buildWhere(organizationId, {
    creatorIds: scopedCreatorIds ?? undefined,
    forceEmpty: Array.isArray(scopedCreatorIds) && scopedCreatorIds.length === 0,
    search,
    statuses,
    textFilters: filters?.textFilters,
  });
  const countQuery =
    search || filters?.textFilters
      ? db
          .select({ count: count() })
          .from(aiInterviewRound)
          .leftJoin(
            recruitingRecordReadModel,
            eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
          )
          .where(where)
      : db.select({ count: count() }).from(aiInterviewRound).where(where);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        allowTextInput: aiInterviewRound.allowTextInput,
        candidateEmail: recruitingRecordReadModel.candidateEmail,
        candidateId: recruitingRecordReadModel.id,
        candidateInviteExpiresAt: aiInterviewRound.candidateInviteExpiresAt,
        candidateName: recruitingRecordReadModel.candidateName,
        candidatePhone: recruitingRecordReadModel.candidatePhone,
        conversationId: aiInterviewRound.conversationId,
        createdAt: aiInterviewRound.createdAt,
        createdBy: aiInterviewRound.createdBy,
        creatorImage: user.image,
        creatorName: user.name,
        creatorOrganizationName: user.feishuTenantName,
        id: aiInterviewRound.id,
        jobDescriptionDepartmentName: department.name,
        jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
        jobDescriptionName: jobDescription.name,
        outcome: recruitingRecordReadModel.outcome,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
        resumeFileName: recruitingRecordReadModel.resumeFileName,
        resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
        roundLabel: aiInterviewRound.roundLabel,
        scheduledAt: aiInterviewRound.scheduledAt,
        scheduledEndAt: aiInterviewRound.scheduledEndAt,
        sortOrder: aiInterviewRound.sortOrder,
        status: aiInterviewRound.status,
        targetRole: recruitingRecordReadModel.targetRole,
        updatedAt: aiInterviewRound.updatedAt,
      })
      .from(aiInterviewRound)
      .leftJoin(
        recruitingRecordReadModel,
        eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
      )
      .leftJoin(
        jobDescription,
        and(
          eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
          eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
        ),
      )
      .leftJoin(
        department,
        and(
          eq(jobDescription.departmentId, department.id),
          eq(department.organizationId, recruitingRecordReadModel.organizationId),
        ),
      )
      .leftJoin(user, eq(aiInterviewRound.createdBy, user.id))
      .where(where)
      .orderBy(buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder))
      .limit(pageSize)
      .offset(offset),
    countQuery,
  ]);

  const { byRoundId: roundDerived, evaluationDocumentsByRoundId } =
    await loadRoundListDerivedFields(rows, organizationId);
  const total = totalRow?.count ?? 0;
  const records: StudioInterviewRoundListRecord[] = rows.map((row) => ({
    allowTextInput: row.allowTextInput,
    candidateEmail: row.candidateEmail,
    candidateId: row.candidateId ?? "",
    candidateInviteExpiresAt: serializeDate(row.candidateInviteExpiresAt),
    candidateName: row.candidateName ?? "",
    candidatePhone: row.candidatePhone,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    feishuDocumentUrl: evaluationDocumentsByRoundId.get(row.id)?.url ?? null,
    feishuEvaluationDocumentStatus:
      evaluationDocumentsByRoundId.get(row.id)?.status ?? "unavailable",
    hasReport: roundDerived.get(row.id)?.hasReport ?? false,
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId ?? "", row.id),
    jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    lastInterviewAt: roundDerived.get(row.id)?.lastInterviewAt ?? null,
    outcome: row.outcome ?? "in_pipeline",
    pipelineStage: row.pipelineStage ?? "screening",
    resumeFileName: row.resumeFileName,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    scheduledEndAt: serializeDate(row.scheduledEndAt),
    sortOrder: row.sortOrder,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  }));

  return {
    page,
    pageSize,
    records,
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

/** Cached version for Server Components */
export function listInterviewRounds(
  organizationId: string,
  filters?: {
    creatorIds?: string[] | null;
    textFilters?: string;
    search?: string | null;
    status?: string | null;
  },
  pagination?: RoundsPaginationInput,
  visibilityScope?: RecruitingVisibilityScope,
) {
  return queryPaginatedInterviewRounds(organizationId, filters, pagination, visibilityScope);
}

/**
 * 按候选人取所有面试轮次（按 sortOrder 升序）。
 * 用于招聘台详情弹窗里的「AI 面试」tab。
 *
 * List all rounds for a given candidate, sorted by sortOrder asc. Used by the
 * resume library detail dialog's "AI 面试" tab.
 */
export async function listInterviewRoundsForCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  const rows = await db
    .select({
      allowTextInput: aiInterviewRound.allowTextInput,
      candidateEmail: recruitingRecordReadModel.candidateEmail,
      candidateId: recruitingRecordReadModel.id,
      candidateInviteExpiresAt: aiInterviewRound.candidateInviteExpiresAt,
      candidateName: recruitingRecordReadModel.candidateName,
      candidatePhone: recruitingRecordReadModel.candidatePhone,
      conversationId: aiInterviewRound.conversationId,
      createdAt: aiInterviewRound.createdAt,
      createdBy: aiInterviewRound.createdBy,
      creatorImage: user.image,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      id: aiInterviewRound.id,
      jobDescriptionDepartmentName: department.name,
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      outcome: recruitingRecordReadModel.outcome,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
      resumeFileName: recruitingRecordReadModel.resumeFileName,
      resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
      roundLabel: aiInterviewRound.roundLabel,
      scheduledAt: aiInterviewRound.scheduledAt,
      scheduledEndAt: aiInterviewRound.scheduledEndAt,
      sortOrder: aiInterviewRound.sortOrder,
      status: aiInterviewRound.status,
      targetRole: recruitingRecordReadModel.targetRole,
      updatedAt: aiInterviewRound.updatedAt,
    })
    .from(aiInterviewRound)
    .leftJoin(
      recruitingRecordReadModel,
      eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(department.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .leftJoin(user, eq(aiInterviewRound.createdBy, user.id))
    .where(
      and(
        eq(aiInterviewRound.recruitingRecordId, candidateId),
        eq(aiInterviewRound.organizationId, organizationId),
      ),
    )
    .orderBy(asc(aiInterviewRound.sortOrder));

  const { byRoundId: roundDerived, evaluationDocumentsByRoundId } =
    await loadRoundListDerivedFields(rows, organizationId);
  return rows.map((row) => ({
    allowTextInput: row.allowTextInput,
    candidateEmail: row.candidateEmail,
    candidateId: row.candidateId ?? candidateId,
    candidateInviteExpiresAt: serializeDate(row.candidateInviteExpiresAt),
    candidateName: row.candidateName ?? "",
    candidatePhone: row.candidatePhone,
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    feishuDocumentUrl: evaluationDocumentsByRoundId.get(row.id)?.url ?? null,
    feishuEvaluationDocumentStatus:
      evaluationDocumentsByRoundId.get(row.id)?.status ?? "unavailable",
    hasReport: roundDerived.get(row.id)?.hasReport ?? false,
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId ?? candidateId, row.id),
    jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    lastInterviewAt: roundDerived.get(row.id)?.lastInterviewAt ?? null,
    outcome: row.outcome ?? "in_pipeline",
    pipelineStage: row.pipelineStage ?? "screening",
    resumeFileName: row.resumeFileName,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    scheduledEndAt: serializeDate(row.scheduledEndAt),
    sortOrder: row.sortOrder,
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  }));
}

export async function loadInterviewRoundDetail(
  roundId: string,
  organizationId: string,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<StudioInterviewRoundDetail | null> {
  if (visibilityScope?.kind === "none") {
    return null;
  }
  if (visibilityScope?.kind === "restricted" && visibilityScope.userIds.length === 0) {
    return null;
  }
  const visibilityCondition =
    visibilityScope?.kind === "restricted"
      ? inArray(aiInterviewRound.createdBy, visibilityScope.userIds)
      : null;
  const conditions = [
    eq(aiInterviewRound.id, roundId),
    eq(aiInterviewRound.organizationId, organizationId),
    visibilityCondition,
  ].filter((condition) => condition !== null);
  const [row] = await db
    .select({
      allowTextInput: aiInterviewRound.allowTextInput,
      candidateFeedbackCategories: aiInterviewRound.candidateFeedbackCategories,
      candidateFeedbackDetail: aiInterviewRound.candidateFeedbackDetail,
      candidateFeedbackSubmittedAt: aiInterviewRound.candidateFeedbackSubmittedAt,
      candidateId: aiInterviewRound.recruitingRecordId,
      candidateInviteExpiresAt: aiInterviewRound.candidateInviteExpiresAt,
      conversationId: aiInterviewRound.conversationId,
      createdAt: aiInterviewRound.createdAt,
      disconnectedAt: aiInterviewRound.disconnectedAt,
      id: aiInterviewRound.id,
      notes: aiInterviewRound.notes,
      roundLabel: aiInterviewRound.roundLabel,
      scheduledAt: aiInterviewRound.scheduledAt,
      scheduledEndAt: aiInterviewRound.scheduledEndAt,
      sessionStartedAt: aiInterviewRound.sessionStartedAt,
      sortOrder: aiInterviewRound.sortOrder,
      status: aiInterviewRound.status,
      updatedAt: aiInterviewRound.updatedAt,
    })
    .from(aiInterviewRound)
    .where(and(...conditions))
    .limit(1);

  if (!row) {
    return null;
  }

  const candidate = await loadStudioCandidate(row.candidateId, organizationId);
  if (!candidate) {
    return null;
  }

  let jdRequiredSkills: string[] = [];
  if (candidate.jobDescriptionId) {
    const [jdRow] = await db
      .select({ policy: jobDescription.resumeScreeningPolicy })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, candidate.jobDescriptionId),
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    jdRequiredSkills = deriveJdRequiredSkills(jdRow?.policy ?? null);
  }

  const [reportRow] = await db
    .select({ id: aiInterviewConversation.conversationId })
    .from(aiInterviewConversation)
    .where(eq(aiInterviewConversation.aiRoundId, row.id))
    .limit(1);

  return {
    allowTextInput: row.allowTextInput,
    candidate,
    candidateFeedback: buildCandidateInterviewFeedback({
      categories: row.candidateFeedbackCategories,
      detail: row.candidateFeedbackDetail,
      submittedAt: row.candidateFeedbackSubmittedAt,
    }),
    candidateInviteExpiresAt: serializeDate(row.candidateInviteExpiresAt),
    conversationId: row.conversationId,
    createdAt: serializeDate(row.createdAt) ?? "",
    disconnectedAt: serializeDate(row.disconnectedAt),
    hasReport: Boolean(reportRow),
    id: row.id,
    interviewLink: buildInterviewLink(row.candidateId, row.id),
    jdRequiredSkills,
    notes: row.notes,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    scheduledEndAt: serializeDate(row.scheduledEndAt),
    sessionStartedAt: serializeDate(row.sessionStartedAt),
    sortOrder: row.sortOrder,
    status: row.status,
    updatedAt: serializeDate(row.updatedAt) ?? "",
  };
}

export interface InterviewRoundSummary {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  interrupted: number;
}

export async function summarizeInterviewRoundCounts(
  organizationId: string,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<InterviewRoundSummary> {
  if (visibilityScope?.kind === "none") {
    return { completed: 0, inProgress: 0, interrupted: 0, pending: 0, total: 0 };
  }
  if (visibilityScope?.kind === "restricted" && visibilityScope.userIds.length === 0) {
    return { completed: 0, inProgress: 0, interrupted: 0, pending: 0, total: 0 };
  }
  const visibilityCondition =
    visibilityScope?.kind === "restricted"
      ? inArray(aiInterviewRound.createdBy, visibilityScope.userIds)
      : null;
  const conditions = [
    eq(aiInterviewRound.organizationId, organizationId),
    visibilityCondition,
  ].filter((condition) => condition !== null);
  const rows = await db
    .select({ count: count(), status: aiInterviewRound.status })
    .from(aiInterviewRound)
    .where(and(...conditions))
    .groupBy(aiInterviewRound.status);

  let total = 0;
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let interrupted = 0;
  for (const row of rows) {
    total += row.count;
    if (row.status === "pending") {
      pending = row.count;
    } else if (row.status === "in_progress") {
      inProgress = row.count;
    } else if (row.status === "completed") {
      completed = row.count;
    } else if (row.status === "interrupted") {
      interrupted = row.count;
    }
  }
  return { completed, inProgress, interrupted, pending, total };
}

/**
 * 把外部传入的 id 统一映射到 roundId(studio_interview_schedule.id)。
 * 兼容历史飞书卡片里 recordId = studio_interview.id 的链接 ——
 * 先按 roundId 命中,miss 后再按 candidateId 取该候选人最新一轮 schedule entry。
 *
 * Normalize an externally supplied id into a roundId. Tries
 * studio_interview_schedule.id first, then falls back to studio_interview.id
 * (picking the latest schedule entry) so historical Feishu links that pre-
 * date the roundId switch still resolve. Returns null when neither matches
 * within the org.
 */
export async function resolveRoundIdFromRecordId(
  recordId: string,
  organizationId: string,
): Promise<string | null> {
  const [asRound] = await db
    .select({ id: aiInterviewRound.id })
    .from(aiInterviewRound)
    .where(
      and(eq(aiInterviewRound.id, recordId), eq(aiInterviewRound.organizationId, organizationId)),
    )
    .limit(1);
  if (asRound) {
    return asRound.id;
  }

  const [asCandidate] = await db
    .select({ id: aiInterviewRound.id })
    .from(aiInterviewRound)
    .where(
      and(
        eq(aiInterviewRound.recruitingRecordId, recordId),
        eq(aiInterviewRound.organizationId, organizationId),
      ),
    )
    .orderBy(desc(aiInterviewRound.sortOrder), desc(aiInterviewRound.createdAt))
    .limit(1);
  return asCandidate?.id ?? null;
}

/** Resolve candidateId from roundId; null if not found. */
export async function resolveCandidateIdForRound(
  roundId: string,
  organizationId: string,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<string | null> {
  if (visibilityScope?.kind === "none") {
    return null;
  }
  if (visibilityScope?.kind === "restricted" && visibilityScope.userIds.length === 0) {
    return null;
  }
  const visibilityCondition =
    visibilityScope?.kind === "restricted"
      ? inArray(aiInterviewRound.createdBy, visibilityScope.userIds)
      : null;
  const conditions = [
    eq(aiInterviewRound.id, roundId),
    eq(aiInterviewRound.organizationId, organizationId),
    visibilityCondition,
  ].filter((condition) => condition !== null);
  const [row] = await db
    .select({ candidateId: aiInterviewRound.recruitingRecordId })
    .from(aiInterviewRound)
    .where(and(...conditions))
    .limit(1);
  return row?.candidateId ?? null;
}

/**
 * 给「公开访问」入口用：拿到一个 id（可能是 roundId 或 candidateId）后，反查出
 * 它归属的 organizationId、最新的 roundId 与 candidateId。不需要预先知道 org。
 *
 * Public-access helper: given an id that may be a roundId or a candidateId,
 * derive the owning organization plus the most-recent roundId & candidateId
 * without requiring caller-side org scoping.
 */
export async function resolvePublicInterviewScope(id: string): Promise<{
  organizationId: string;
  roundId: string;
  candidateId: string;
} | null> {
  const [asRound] = await db
    .select({
      candidateId: aiInterviewRound.recruitingRecordId,
      id: aiInterviewRound.id,
      organizationId: aiInterviewRound.organizationId,
    })
    .from(aiInterviewRound)
    .where(eq(aiInterviewRound.id, id))
    .limit(1);
  if (asRound) {
    return {
      candidateId: asRound.candidateId,
      organizationId: asRound.organizationId,
      roundId: asRound.id,
    };
  }

  const [asCandidate] = await db
    .select({
      candidateId: aiInterviewRound.recruitingRecordId,
      id: aiInterviewRound.id,
      organizationId: aiInterviewRound.organizationId,
    })
    .from(aiInterviewRound)
    .where(eq(aiInterviewRound.recruitingRecordId, id))
    .orderBy(desc(aiInterviewRound.sortOrder), desc(aiInterviewRound.createdAt))
    .limit(1);
  return asCandidate
    ? {
        candidateId: asCandidate.candidateId,
        organizationId: asCandidate.organizationId,
        roundId: asCandidate.id,
      }
    : null;
}

/**
 * 公开访问入口：仅给 candidateId（studio_interview.id）反查 organizationId。
 * Public-access helper that resolves the owning org for a candidateId.
 */
export async function resolvePublicResumeOrgId(candidateId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: recruitingRecordReadModel.organizationId })
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, candidateId))
    .limit(1);
  return row?.organizationId ?? null;
}
