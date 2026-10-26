import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { loadCandidateAvatarVersions } from "@app/resume-processing/review/support/candidate-avatars-dao";
// Round-keyed DAO for AI 面试 列表与详情。
// 主查询：FROM studio_interview_schedule LEFT JOIN studio_interview
// LEFT JOIN job_description LEFT JOIN user LEFT JOIN (conversations 是否存在) AS hasReport。
//
// Round-keyed DAO. Drives off studio_interview_schedule and joins back to
// the candidate row, JD, creator, and a "has at least one conversation" flag.

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { uniq } from "lodash-es";
import { db } from "../../../../../infrastructure/db/index";
import { serializeDate } from "@app/database/serialize";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import {
  department,
  aiInterviewConversation,
  jobDescription,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import { buildInterviewLink } from "@app/shared/interview/interview-record";
import { deriveJdRequiredSkills } from "@app/shared/resume-screening";
import { buildCandidateInterviewFeedback } from "@app/db-schema/studio-interviews";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@app/shared/studio-interview-rounds";
import { loadStudioCandidate } from "./studio-interviews";
import { loadRoundFeishuEvaluationDocuments } from "./evaluation-documents";

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

const aiRoundListSelection = {
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
  recruitingRecordId: aiInterviewRound.recruitingRecordId,
  resumeContentHash: recruitingRecordReadModel.resumeContentHash,
  resumeFileName: recruitingRecordReadModel.resumeFileName,
  resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
  roundLabel: aiInterviewRound.roundLabel,
  scheduledAt: aiInterviewRound.scheduledAt,
  scheduledEndAt: aiInterviewRound.scheduledEndAt,
  sortOrder: aiInterviewRound.sortOrder,
  status: aiInterviewRound.status,
  targetRole: recruitingRecordReadModel.targetRole,
  updatedAt: aiInterviewRound.updatedAt,
};

// 列表行：轮次 + 候选人快照 + 岗位 / 部门 + 创建人，再批量补报告、评价表与头像。
// List rows: round + candidate snapshot + JD / department + creator, then batched derived fields.
async function loadAiRoundListRows(
  where: SQL | undefined,
  organizationId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  const rows = await db
    .select(aiRoundListSelection)
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
    .where(and(eq(aiInterviewRound.organizationId, organizationId), where))
    .orderBy(asc(aiInterviewRound.sortOrder));

  const [{ byRoundId: roundDerived, evaluationDocumentsByRoundId }, avatarVersions] =
    await Promise.all([
      loadRoundListDerivedFields(rows, organizationId),
      loadCandidateAvatarVersions(rows.map((row) => row.resumeContentHash)),
    ]);
  return rows.map((row) => {
    const candidateId = row.candidateId ?? row.recruitingRecordId;
    return {
      allowTextInput: row.allowTextInput,
      candidateAvatarVersion: avatarVersions.get(row.resumeContentHash ?? "") ?? null,
      candidateEmail: row.candidateEmail,
      candidateId,
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
      interviewLink: buildInterviewLink(candidateId, row.id),
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
    };
  });
}

/**
 * 按轮次 id 批量取列表行，供面试记录列表在分页后补全当前页。顺序不保证。
 * Load list rows for the given round ids (used after the merged list paginates). Order is unspecified.
 */
export function loadAiInterviewRoundListRecords(
  roundIds: string[],
  organizationId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  if (roundIds.length === 0) {
    return Promise.resolve([]);
  }
  return loadAiRoundListRows(inArray(aiInterviewRound.id, uniq(roundIds)), organizationId);
}

/**
 * 按候选人取所有面试轮次（按 sortOrder 升序）。
 * 用于招聘台详情弹窗里的「AI 面试」tab。
 *
 * List all rounds for a given candidate, sorted by sortOrder asc. Used by the
 * resume library detail dialog's "AI 面试" tab.
 */
export function listInterviewRoundsForCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioInterviewRoundListRecord[]> {
  return loadAiRoundListRows(eq(aiInterviewRound.recruitingRecordId, candidateId), organizationId);
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

  const [[reportRow], [resumeRow]] = await Promise.all([
    db
      .select({ id: aiInterviewConversation.conversationId })
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.aiRoundId, row.id))
      .limit(1),
    db
      .select({ resumeContentHash: recruitingRecordReadModel.resumeContentHash })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, row.candidateId))
      .limit(1),
  ]);
  const avatarVersions = await loadCandidateAvatarVersions([resumeRow?.resumeContentHash]);

  return {
    allowTextInput: row.allowTextInput,
    candidate,
    candidateAvatarVersion: avatarVersions.get(resumeRow?.resumeContentHash ?? "") ?? null,
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
