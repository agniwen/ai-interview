/* oxlint-disable max-lines -- resume library list/detail/filter queries stay co-located. */
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { listActiveDuplicateMatchCounts } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@arc/ai-recruitment-copilot-backend/lib/server/db/pagination";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import { intersectRequestedCreatorIds } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
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
import { candidateOutcomeValues, pipelineStageValues } from "@arc/db-schema/studio-interviews";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
  ResumeLibraryListRecord,
  ResumeStageProgress,
} from "@arc/shared/studio-resumes";
import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { resumeReviewActionSchema } from "@arc/shared/resume-review";
import type { ResumeReviewAction } from "@arc/shared/resume-review";
import { resumeScreeningResultSchema } from "@arc/shared/resume-screening";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import { normalizeSkill } from "./skills";
import { buildResumeProfileSnapshot } from "./resume-profile-snapshot";

function parseResumeReviewBaseScore(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
}

function parseResumeReviewNextStepAction(
  value: string | null | undefined,
): ResumeReviewAction | null {
  const parsed = resumeReviewActionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const SORT_COLUMNS = ["createdAt", "candidateName", "structuredScore", "updatedAt"] as const;

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
  structuredMaxScore: z.number().int().min(0).max(100).optional().nullable(),
  structuredMinScore: z.number().int().min(0).max(100).optional().nullable(),
});

type Pagination = z.infer<typeof paginationSchema>;
type Filters = z.infer<typeof filtersSchema>;
type ResumeQueryFilters = z.infer<typeof filtersSchema> & { forceEmpty?: boolean };

export class ResumeStructuredScoreQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeStructuredScoreQueryError";
  }
}

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

function buildWhere(organizationId: string, filters?: ResumeQueryFilters) {
  if (filters?.forceEmpty) {
    return sql`false`;
  }
  const conditions = [
    eq(studioInterview.organizationId, organizationId),
    buildSearchCondition(filters?.search),
    buildSkillsCondition(filters?.skills),
    buildJdIdsCondition(filters?.jobDescriptionIds),
    buildCreatorIdsCondition(filters?.creatorIds),
    buildStagesCondition(filters?.pipelineStages),
    buildOutcomesCondition(filters?.outcomes),
    filters?.structuredMinScore === null || filters?.structuredMinScore === undefined
      ? null
      : gte(studioInterview.structuredCompositeScore, filters.structuredMinScore),
    filters?.structuredMaxScore === null || filters?.structuredMaxScore === undefined
      ? null
      : lte(studioInterview.structuredCompositeScore, filters.structuredMaxScore),
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
  hrResumeAssessment: studioInterview.hrResumeAssessment,
  hrResumeAssessmentUpdatedAt: studioInterview.hrResumeAssessmentUpdatedAt,
  hrResumeAssessmentUpdatedBy: studioInterview.hrResumeAssessmentUpdatedBy,
  humanInterviewScheduledAt: studioInterview.humanInterviewScheduledAt,
  humanInterviewerId: studioInterview.humanInterviewerId,
  id: studioInterview.id,
  jobDescriptionDepartmentName: department.name,
  jobDescriptionId: studioInterview.jobDescriptionId,
  jobDescriptionName: jobDescription.name,
  jobDescriptionResumeScreeningPolicyHash: jobDescription.resumeScreeningPolicyHash,
  jobEvaluationMode: jobDescription.evaluationMode,
  notes: studioInterview.notes,
  offerAcceptedAt: studioInterview.offerAcceptedAt,
  offerSentAt: studioInterview.offerSentAt,
  outcome: studioInterview.outcome,
  pipelineStage: studioInterview.pipelineStage,
  resumeContentHash: studioInterview.resumeContentHash,
  resumeEducationExperiences:
    sql<unknown>`${studioInterview.resumeProfile}->'educationExperiences'`.as(
      "resume_education_experiences",
    ),
  resumeEducationGraduationYear: sql<
    string | null
  >`${studioInterview.resumeProfile}->'educationExperiences'->0->>'graduationYear'`.as(
    "resume_education_graduation_year",
  ),
  resumeEducationLevel: sql<
    string | null
  >`${studioInterview.resumeProfile}->'educationExperiences'->0->>'educationLevel'`.as(
    "resume_education_level",
  ),
  resumeEducationMajor: sql<
    string | null
  >`${studioInterview.resumeProfile}->'educationExperiences'->0->>'major'`.as(
    "resume_education_major",
  ),
  resumeEducationPeriod: sql<
    string | null
  >`${studioInterview.resumeProfile}->'educationExperiences'->0->>'period'`.as(
    "resume_education_period",
  ),
  resumeEducationSchool: sql<
    string | null
  >`${studioInterview.resumeProfile}->'educationExperiences'->0->>'school'`.as(
    "resume_education_school",
  ),
  resumeEvaluationStatus: studioInterview.resumeEvaluationStatus,
  resumeFileName: studioInterview.resumeFileName,
  resumeParseError: studioInterview.resumeParseError,
  resumeParseStatus: studioInterview.resumeParseStatus,
  resumeParsedAt: studioInterview.resumeParsedAt,
  resumeProjectExperiences: sql<unknown>`${studioInterview.resumeProfile}->'projectExperiences'`.as(
    "resume_project_experiences",
  ),
  resumeReviewBaseScore: sql<
    string | null
  >`coalesce(${studioInterview.resumeReview}->'overall'->>'baseScore', ${studioInterview.resumeReview}->'overall'->>'score')`.as(
    "resume_review_base_score",
  ),
  resumeReviewConclusion: sql<
    string | null
  >`${studioInterview.resumeReview}->'overall'->>'conclusion'`.as("resume_review_conclusion"),
  resumeReviewError: studioInterview.resumeReviewError,
  resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
  resumeReviewNextStepAction: sql<
    string | null
  >`${studioInterview.resumeReview}->'nextStep'->>'action'`.as("resume_review_next_step_action"),
  resumeReviewQueuedAt: studioInterview.resumeReviewQueuedAt,
  resumeReviewRunId: studioInterview.resumeReviewRunId,
  resumeReviewStatus: studioInterview.resumeReviewStatus,
  resumeSchool: sql<string | null>`${studioInterview.resumeProfile}->'schools'->>0`.as(
    "resume_school",
  ),
  resumeScreeningError: studioInterview.resumeScreeningError,
  resumeScreeningEvaluatedAt: studioInterview.resumeScreeningEvaluatedAt,
  resumeScreeningResult: studioInterview.resumeScreeningResult,
  resumeScreeningStatus: studioInterview.resumeScreeningStatus,
  resumeSkills: sql<unknown>`${studioInterview.resumeProfile}->'skills'`.as("resume_skills"),
  resumeStorageKey: studioInterview.resumeStorageKey,
  resumeWorkCompany: sql<
    string | null
  >`${studioInterview.resumeProfile}->'workExperiences'->0->>'company'`.as("resume_work_company"),
  resumeWorkExperiences: sql<unknown>`${studioInterview.resumeProfile}->'workExperiences'`.as(
    "resume_work_experiences",
  ),
  resumeWorkPeriod: sql<
    string | null
  >`${studioInterview.resumeProfile}->'workExperiences'->0->>'period'`.as("resume_work_period"),
  resumeWorkRole: sql<
    string | null
  >`${studioInterview.resumeProfile}->'workExperiences'->0->>'role'`.as("resume_work_role"),
  structuredCompositeScore: studioInterview.structuredCompositeScore,
  structuredGateSortRank: studioInterview.structuredGateSortRank,
  structuredGateStatus: studioInterview.structuredGateStatus,
  structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
  structuredScoreGrade: studioInterview.structuredScoreGrade,
  targetRole: studioInterview.targetRole,
  updatedAt: studioInterview.updatedAt,
  writtenTestScheduledAt: studioInterview.writtenTestScheduledAt,
  writtenTestScore: studioInterview.writtenTestScore,
} as const;

// 列表只取卡片、筛选结果和轻量操作实际需要的字段；评价详情、错误信息及阶段元数据
// 由详情接口按需读取，避免每一页重复传输大块 JSON。
const LIST_SELECTED_COLUMNS = {
  candidateEmail: SELECTED_COLUMNS.candidateEmail,
  candidateName: SELECTED_COLUMNS.candidateName,
  candidatePhone: SELECTED_COLUMNS.candidatePhone,
  createdAt: SELECTED_COLUMNS.createdAt,
  createdBy: SELECTED_COLUMNS.createdBy,
  creatorImage: SELECTED_COLUMNS.creatorImage,
  creatorName: SELECTED_COLUMNS.creatorName,
  id: SELECTED_COLUMNS.id,
  jobDescriptionDepartmentName: SELECTED_COLUMNS.jobDescriptionDepartmentName,
  jobDescriptionId: SELECTED_COLUMNS.jobDescriptionId,
  jobDescriptionName: SELECTED_COLUMNS.jobDescriptionName,
  jobEvaluationMode: SELECTED_COLUMNS.jobEvaluationMode,
  notes: SELECTED_COLUMNS.notes,
  outcome: SELECTED_COLUMNS.outcome,
  pipelineStage: SELECTED_COLUMNS.pipelineStage,
  resumeEducationExperiences: SELECTED_COLUMNS.resumeEducationExperiences,
  resumeEducationGraduationYear: SELECTED_COLUMNS.resumeEducationGraduationYear,
  resumeEducationLevel: SELECTED_COLUMNS.resumeEducationLevel,
  resumeEducationMajor: SELECTED_COLUMNS.resumeEducationMajor,
  resumeEducationPeriod: SELECTED_COLUMNS.resumeEducationPeriod,
  resumeEducationSchool: SELECTED_COLUMNS.resumeEducationSchool,
  resumeEvaluationStatus: SELECTED_COLUMNS.resumeEvaluationStatus,
  resumeFileName: SELECTED_COLUMNS.resumeFileName,
  resumeParseStatus: SELECTED_COLUMNS.resumeParseStatus,
  resumeProjectExperiences: SELECTED_COLUMNS.resumeProjectExperiences,
  resumeReviewBaseScore: SELECTED_COLUMNS.resumeReviewBaseScore,
  resumeReviewConclusion: SELECTED_COLUMNS.resumeReviewConclusion,
  resumeReviewError: SELECTED_COLUMNS.resumeReviewError,
  resumeReviewGeneratedAt: SELECTED_COLUMNS.resumeReviewGeneratedAt,
  resumeReviewNextStepAction: SELECTED_COLUMNS.resumeReviewNextStepAction,
  resumeReviewQueuedAt: SELECTED_COLUMNS.resumeReviewQueuedAt,
  resumeReviewRunId: SELECTED_COLUMNS.resumeReviewRunId,
  resumeReviewStatus: SELECTED_COLUMNS.resumeReviewStatus,
  resumeSchool: SELECTED_COLUMNS.resumeSchool,
  resumeSkills: SELECTED_COLUMNS.resumeSkills,
  resumeStorageKey: SELECTED_COLUMNS.resumeStorageKey,
  resumeWorkCompany: SELECTED_COLUMNS.resumeWorkCompany,
  resumeWorkExperiences: SELECTED_COLUMNS.resumeWorkExperiences,
  resumeWorkPeriod: SELECTED_COLUMNS.resumeWorkPeriod,
  resumeWorkRole: SELECTED_COLUMNS.resumeWorkRole,
  structuredCompositeScore: SELECTED_COLUMNS.structuredCompositeScore,
  structuredGateSortRank: SELECTED_COLUMNS.structuredGateSortRank,
  structuredGateStatus: SELECTED_COLUMNS.structuredGateStatus,
  structuredScoreGrade: SELECTED_COLUMNS.structuredScoreGrade,
  targetRole: SELECTED_COLUMNS.targetRole,
  updatedAt: SELECTED_COLUMNS.updatedAt,
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
  const orderBy =
    sortBy === "structuredScore"
      ? [
          asc(
            sql`case when ${studioInterview.resumeReviewStatus} = 'ready'
              and ${studioInterview.structuredCompositeScore} is not null
              then 0 else 1 end`,
          ),
          asc(studioInterview.structuredGateSortRank),
          desc(studioInterview.structuredCompositeScore),
          asc(studioInterview.candidateName),
          asc(studioInterview.id),
        ]
      : [buildOrderBy(ORDER_COLUMNS, sortBy, sortOrder)];

  return db
    .select(LIST_SELECTED_COLUMNS)
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
    .orderBy(...orderBy)
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

function toDuplicateMatchSummary(
  value: { count: number; highestLevel: "high" | "low" | "medium" | null } | undefined,
): ResumeDuplicateMatchSummary | null {
  return value && value.count > 0 ? { count: value.count, highestLevel: value.highestLevel } : null;
}

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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function buildResumeSkills(value: unknown) {
  const seen = new Set<string>();
  return toStringArray(value)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function parseResumeScreeningResult(value: unknown) {
  const parsed = resumeScreeningResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function resolveResumeEvaluationArtifactMode(row: {
  jobEvaluationMode: "legacy" | "structured" | null;
  resumeReviewBaseScore: string | null;
  structuredCompositeScore: number | null;
}) {
  if (row.jobEvaluationMode === "structured" && row.structuredCompositeScore !== null) {
    return "structured" as const;
  }
  if (row.jobEvaluationMode === "legacy" && row.resumeReviewBaseScore !== null) {
    return "legacy" as const;
  }
  return null;
}

// 批量组装 4 类派生字段，集中在一个函数里避免在分页行上重复 correlated subquery。
// Batch-assembles 4 derived branches in one place to avoid per-row correlated subqueries.
// oxlint-disable-next-line complexity
async function loadResumeDerivedFields(
  candidateIds: string[],
): Promise<Map<string, ResumeDerivedFields>> {
  const ids = uniq(candidateIds.filter(Boolean));
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
        feedback: studioHumanInterviewRound.feedback,
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
      completedRoundsMissingFeedback: countedRows.filter(
        (row) => row.status === "completed" && !row.feedback?.trim(),
      ).length,
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

function toRecord(
  row: Row,
  derived?: ResumeDerivedFields,
  duplicateMatch?: ResumeDuplicateMatchSummary | null,
): ResumeLibraryListRecord {
  const resolvedDerived = derived ?? EMPTY_DERIVED_FIELDS;
  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: serializeDate(row.createdAt),
    createdBy: row.createdBy,
    creatorImage: row.creatorImage,
    creatorName: row.creatorName,
    duplicateMatch: duplicateMatch ?? null,
    hasInterviewRounds: resolvedDerived.hasInterviewRounds,
    hasResumeFile: Boolean(row.resumeStorageKey),
    id: row.id,
    jobDescriptionDepartmentName: row.jobDescriptionDepartmentName,
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    jobEvaluationMode: row.jobEvaluationMode,
    lastInterviewAt: resolvedDerived.lastInterviewAt,
    notes: row.notes,
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    resumeEvaluationArtifactMode: resolveResumeEvaluationArtifactMode(row),
    resumeEvaluationStatus: row.resumeEvaluationStatus,
    resumeFileName: row.resumeFileName,
    resumeParseStatus: row.resumeParseStatus,
    resumeProfileSnapshot: buildResumeProfileSnapshot(row),
    resumeReviewBaseScore: parseResumeReviewBaseScore(row.resumeReviewBaseScore),
    resumeReviewError: row.resumeReviewError,
    resumeReviewGeneratedAt: serializeDate(row.resumeReviewGeneratedAt),
    resumeReviewNextStepAction: parseResumeReviewNextStepAction(row.resumeReviewNextStepAction),
    resumeReviewQueuedAt: serializeDate(row.resumeReviewQueuedAt),
    resumeReviewRunId: row.resumeReviewRunId,
    resumeReviewStatus: row.resumeReviewStatus,
    resumeSkills: buildResumeSkills(row.resumeSkills),
    resumeSummary: row.resumeReviewConclusion ?? row.notes?.trim() ?? null,
    stageProgress: resolvedDerived.stageProgress,
    structuredCompositeScore: row.structuredCompositeScore,
    structuredGateSortRank: row.structuredGateSortRank,
    structuredGateStatus: row.structuredGateStatus,
    structuredScoreGrade: row.structuredScoreGrade,
    targetRole: row.targetRole,
    updatedAt: serializeDate(row.updatedAt),
  };
}

export async function queryPaginatedResumeRecords(
  organizationId: string,
  filters?: {
    search?: string | null;
    creatorIds?: string[] | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
    pipelineStages?: string[] | null;
    outcomes?: string[] | null;
    structuredMaxScore?: number | null;
    structuredMinScore?: number | null;
  },
  pagination?: Record<string, unknown>,
  visibilityScope?: RecruitingVisibilityScope,
  knownTotal?: number,
): Promise<PaginatedResumeLibraryResult> {
  const parsedFilters = filtersSchema.parse(filters ?? {});
  const parsedPagination = paginationSchema.parse(pagination ?? {});
  const requestsStructuredScores =
    parsedPagination.sortBy === "structuredScore" ||
    (parsedFilters.structuredMinScore !== null && parsedFilters.structuredMinScore !== undefined) ||
    (parsedFilters.structuredMaxScore !== null && parsedFilters.structuredMaxScore !== undefined);
  if (requestsStructuredScores) {
    const selectedJobIds = [
      ...new Set((parsedFilters.jobDescriptionIds ?? []).filter((id) => id.trim().length > 0)),
    ];
    if (selectedJobIds.length !== 1) {
      throw new ResumeStructuredScoreQueryError("结构化评分排序或筛选必须且只能选择一个岗位。");
    }
    const [selectedJob] = await db
      .select({ evaluationMode: jobDescription.evaluationMode })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, selectedJobIds[0] as string),
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      )
      .limit(1);
    if (selectedJob?.evaluationMode !== "structured") {
      throw new ResumeStructuredScoreQueryError("所选岗位不支持结构化评分排序或筛选。");
    }
  }
  const scopedCreatorIds = visibilityScope
    ? intersectRequestedCreatorIds(parsedFilters.creatorIds, visibilityScope)
    : parsedFilters.creatorIds;
  const scopedFilters: ResumeQueryFilters = {
    ...parsedFilters,
    creatorIds: scopedCreatorIds,
    forceEmpty:
      visibilityScope?.kind !== "all" &&
      Array.isArray(scopedCreatorIds) &&
      scopedCreatorIds.length === 0,
  };
  const where = buildWhere(organizationId, scopedFilters);

  const totalPromise =
    knownTotal === undefined
      ? (async () => {
          const [row] = await db.select({ count: count() }).from(studioInterview).where(where);
          return row?.count ?? 0;
        })()
      : Promise.resolve(knownTotal);
  const [rows, total] = await Promise.all([
    selectRows({
      filters: scopedFilters,
      organizationId,
      pagination: parsedPagination,
    }),
    totalPromise,
  ]);

  const recordIds = rows.map((row) => row.id);
  const [derivedFields, duplicateMatches] = await Promise.all([
    loadResumeDerivedFields(recordIds),
    listActiveDuplicateMatchCounts({
      organizationId,
      sourceIds: recordIds,
      sourceType: "studio_interview",
    }),
  ]);
  return {
    page: parsedPagination.page,
    pageSize: parsedPagination.pageSize,
    records: rows.map((row) =>
      toRecord(
        row,
        derivedFields.get(row.id),
        toDuplicateMatchSummary(duplicateMatches.get(row.id)),
      ),
    ),
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
    pipelineStages?: string[] | null;
    outcomes?: string[] | null;
    structuredMaxScore?: number | null;
    structuredMinScore?: number | null;
  },
  pagination?: Partial<Pagination>,
  visibilityScope?: RecruitingVisibilityScope,
) {
  return queryPaginatedResumeRecords(organizationId, filters, pagination, visibilityScope);
}

export async function loadResumeDetail(
  id: string,
  organizationId: string,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<ResumeLibraryDetail | null> {
  if (visibilityScope?.kind === "none") {
    return null;
  }
  if (visibilityScope?.kind === "restricted" && visibilityScope.userIds.length === 0) {
    return null;
  }
  const visibilityCondition =
    visibilityScope?.kind === "restricted"
      ? inArray(studioInterview.createdBy, visibilityScope.userIds)
      : null;
  const conditions = [
    eq(studioInterview.id, id),
    eq(studioInterview.organizationId, organizationId),
    visibilityCondition,
  ].filter((condition) => condition !== null);
  const [row] = await db
    .select({
      ...SELECTED_COLUMNS,
      interviewQuestions: studioInterview.interviewQuestions,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
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
    .where(and(...conditions))
    .limit(1);

  if (!row) {
    return null;
  }

  const { interviewQuestions, resumeProfile, resumeReview, ...rest } = row;
  const resumeScreeningResult = parseResumeScreeningResult(rest.resumeScreeningResult);
  const structuredEvaluation = structuredResumeEvaluationV1Schema.safeParse(
    rest.structuredResumeEvaluation,
  );
  const [derivedFields, duplicateMatches] = await Promise.all([
    loadResumeDerivedFields([rest.id]),
    listActiveDuplicateMatchCounts({
      organizationId,
      sourceIds: [rest.id],
      sourceType: "studio_interview",
    }),
  ]);
  return {
    ...toRecord(
      rest,
      derivedFields.get(rest.id),
      toDuplicateMatchSummary(duplicateMatches.get(rest.id)),
    ),
    candidateExpectationsMeta: rest.candidateExpectationsMeta,
    closedAt: serializeDate(rest.closedAt),
    closedMeta: rest.closedMeta,
    closedReason: rest.closedReason,
    creatorOrganizationName: rest.creatorOrganizationName,
    hrResumeAssessment: rest.hrResumeAssessment,
    hrResumeAssessmentUpdatedAt: serializeDate(rest.hrResumeAssessmentUpdatedAt),
    hrResumeAssessmentUpdatedBy: rest.hrResumeAssessmentUpdatedBy,
    humanInterviewScheduledAt: serializeDate(rest.humanInterviewScheduledAt),
    humanInterviewerId: rest.humanInterviewerId,
    interviewQuestions: interviewQuestions ?? [],
    offerAcceptedAt: serializeDate(rest.offerAcceptedAt),
    offerSentAt: serializeDate(rest.offerSentAt),
    resumeContentHash: rest.resumeContentHash,
    resumeEvaluationStatus: rest.resumeEvaluationStatus,
    resumeParseError: rest.resumeParseError,
    resumeParsedAt: serializeDate(rest.resumeParsedAt),
    resumeProfile,
    resumeReview,
    resumeReviewError: rest.resumeReviewError,
    resumeReviewGeneratedAt: serializeDate(rest.resumeReviewGeneratedAt),
    resumeReviewQueuedAt: serializeDate(rest.resumeReviewQueuedAt),
    resumeScreeningError: rest.resumeScreeningError,
    resumeScreeningEvaluatedAt: serializeDate(rest.resumeScreeningEvaluatedAt),
    resumeScreeningResult,
    resumeScreeningStale: Boolean(
      resumeScreeningResult?.policyHash &&
      rest.jobDescriptionResumeScreeningPolicyHash &&
      resumeScreeningResult.policyHash !== rest.jobDescriptionResumeScreeningPolicyHash,
    ),
    resumeScreeningStatus: rest.resumeScreeningStatus,
    structuredResumeEvaluation: structuredEvaluation.success ? structuredEvaluation.data : null,
    writtenTestScheduledAt: serializeDate(rest.writtenTestScheduledAt),
    writtenTestScore: rest.writtenTestScore,
  };
}

export function loadResumeDetailForWorkspaceMember(
  id: string,
  organizationId: string,
): Promise<ResumeLibraryDetail | null> {
  return loadResumeDetail(id, organizationId);
}
