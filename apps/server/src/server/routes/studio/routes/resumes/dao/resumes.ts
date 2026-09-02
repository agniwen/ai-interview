import { listTextFiltersSchema } from "@app/shared/list-text-filters";
/* oxlint-disable max-lines -- resume library list/detail/filter queries stay co-located. */
import { and, arrayContains, asc, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@server/lib/server/db/index";
import { listActiveStudioDuplicateMatchSummaries } from "@server/lib/server/resume-semantic/duplicate-matches";
import {
  buildOrderBy,
  calcTotalPages,
  makePaginationSchema,
} from "@server/lib/server/db/pagination";
import { serializeDate } from "@server/lib/server/db/serialize";
import { intersectRequestedCreatorIds } from "../../../../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import { department, jobDescription, studioInterview, user } from "@app/db-schema/schema";
import { candidateOutcomeValues, pipelineStageValues } from "@app/db-schema/studio-interviews";
import type { JsonValue } from "@app/db-schema/json";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryDetail,
  ResumeLibraryListRecord,
  ResumeStageProgress,
} from "@app/shared/studio-resumes";
import type { ResumeDuplicateMatchSummary } from "@app/shared/resume-duplicates";
import { EMPTY_STAGE_PROGRESS, loadResumeStageProgress } from "./resume-derived-fields";
import { resumeReviewActionSchema } from "@app/shared/resume-review";
import type { ResumeReviewAction } from "@app/shared/resume-review";
import { resumeScreeningResultSchema } from "@app/shared/resume-screening";
import { structuredResumeEvaluationV1Schema } from "@app/db-schema/structured-resume-evaluation";
import {
  qualitativeRecommendationLevelSchema,
  qualitativeResumeEvaluationSchema,
} from "@app/db-schema/qualitative-resume-evaluation";
import { normalizeSkill } from "./skills";
import { buildResumeKeywordSearch, buildResumeAtomicSearch } from "./keyword-search";
import { buildResumeProfileSnapshot } from "./resume-profile-snapshot";
import { loadLatestFeishuDocumentUrls } from "../../interviews/dao/feishu-document-urls";

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
const paginationInputSchema = z.object({
  page: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});
const pipelineStageSchema = z.enum(pipelineStageValues);
const candidateOutcomeSchema = z.enum(candidateOutcomeValues);
const resumeSkillsSchema = z.array(z.string());

// 允许调用方原样传入 CSV 拆分结果（可能含空串）；buildWhere 内统一 trim + drop blank。
// Accept caller-supplied arrays that may contain empty/whitespace entries —
// buildWhere drops blanks before using them so we don't need to error here.
const filtersSchema = z.object({
  createdAtBefore: z.date().optional(),
  createdAtFrom: z.date().optional(),
  creatorIds: z.array(z.string()).max(50).optional().nullable(),
  jobDescriptionIds: z.array(z.string()).max(50).optional().nullable(),
  outcomes: z.array(z.string()).max(10).optional().nullable(),
  pipelineStages: z.array(z.string()).max(10).optional().nullable(),
  recommendationLevels: z.array(qualitativeRecommendationLevelSchema).max(4).optional().nullable(),
  search: z.string().trim().max(120).optional().nullable(),
  skills: z.array(z.string()).max(20).optional().nullable(),
  structuredMaxScore: z.number().int().min(0).max(100).optional().nullable(),
  structuredMinScore: z.number().int().min(0).max(100).optional().nullable(),
  textFilters: listTextFiltersSchema("resumes"),
});

type Pagination = z.infer<typeof paginationSchema>;
type PaginationInput = z.input<typeof paginationInputSchema>;
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
  return buildResumeKeywordSearch(studioInterview, search) ?? null;
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
  const filtered = (stages ?? []).flatMap((stage) => {
    const parsed = pipelineStageSchema.safeParse(stage);
    return parsed.success ? [parsed.data] : [];
  });
  return filtered.length > 0 ? inArray(studioInterview.pipelineStage, filtered) : null;
}

function buildOutcomesCondition(outcomes: string[] | null | undefined) {
  const filtered = (outcomes ?? []).flatMap((outcome) => {
    const parsed = candidateOutcomeSchema.safeParse(outcome);
    return parsed.success ? [parsed.data] : [];
  });
  return filtered.length > 0 ? inArray(studioInterview.outcome, filtered) : null;
}

function buildRecommendationLevelsCondition(levels: ResumeQueryFilters["recommendationLevels"]) {
  return levels?.length ? inArray(studioInterview.qualitativeRecommendationLevel, levels) : null;
}

function buildStructuredScoreConditions(filters?: ResumeQueryFilters) {
  const conditions = [];
  if (filters?.structuredMinScore !== null && filters?.structuredMinScore !== undefined) {
    conditions.push(gte(studioInterview.structuredCompositeScore, filters.structuredMinScore));
  }
  if (filters?.structuredMaxScore !== null && filters?.structuredMaxScore !== undefined) {
    conditions.push(lte(studioInterview.structuredCompositeScore, filters.structuredMaxScore));
  }
  return conditions;
}

function buildWhere(organizationId: string, filters?: ResumeQueryFilters) {
  if (filters?.forceEmpty) {
    return sql`false`;
  }
  const conditions = [
    eq(studioInterview.organizationId, organizationId),
    filters?.createdAtFrom ? gte(studioInterview.createdAt, filters.createdAtFrom) : null,
    // Exclusive next-day midnight includes the entire end date, including fractional seconds.
    filters?.createdAtBefore ? lt(studioInterview.createdAt, filters.createdAtBefore) : null,
    buildSearchCondition(filters?.search),
    buildResumeAtomicSearch(studioInterview, filters?.textFilters),
    buildSkillsCondition(filters?.skills),
    buildJdIdsCondition(filters?.jobDescriptionIds),
    buildCreatorIdsCondition(filters?.creatorIds),
    buildStagesCondition(filters?.pipelineStages),
    buildOutcomesCondition(filters?.outcomes),
    buildRecommendationLevelsCondition(filters?.recommendationLevels),
    ...buildStructuredScoreConditions(filters),
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
  qualitativeJobDescriptionVersionId: studioInterview.qualitativeJobDescriptionVersionId,
  qualitativeRecommendationLevel: studioInterview.qualitativeRecommendationLevel,
  qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
  qualitativeResumeSummary: sql<
    string | null
  >`${studioInterview.qualitativeResumeEvaluation}->>'conciseOverall'`.as(
    "qualitative_resume_summary",
  ),
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
  resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
  resumeEvaluationAttemptMode: studioInterview.resumeEvaluationAttemptMode,
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
  resumeSkills: sql<JsonValue | null>`${studioInterview.resumeProfile}->'skills'`.as(
    "resume_skills",
  ),
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
  structuredResumeSummary: sql<string | null>`coalesce(
    ${studioInterview.structuredResumeEvaluation}->'narrative'->>'overallComment',
    ${studioInterview.structuredResumeEvaluation}->'narrative'->>'summary'
  )`.as("structured_resume_summary"),
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
  qualitativeRecommendationLevel: SELECTED_COLUMNS.qualitativeRecommendationLevel,
  qualitativeResumeSummary: SELECTED_COLUMNS.qualitativeResumeSummary,
  resumeEducationExperiences: SELECTED_COLUMNS.resumeEducationExperiences,
  resumeEducationGraduationYear: SELECTED_COLUMNS.resumeEducationGraduationYear,
  resumeEducationLevel: SELECTED_COLUMNS.resumeEducationLevel,
  resumeEducationMajor: SELECTED_COLUMNS.resumeEducationMajor,
  resumeEducationPeriod: SELECTED_COLUMNS.resumeEducationPeriod,
  resumeEducationSchool: SELECTED_COLUMNS.resumeEducationSchool,
  resumeEvaluationArtifactMode: SELECTED_COLUMNS.resumeEvaluationArtifactMode,
  resumeEvaluationAttemptMode: SELECTED_COLUMNS.resumeEvaluationAttemptMode,
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
  structuredResumeSummary: SELECTED_COLUMNS.structuredResumeSummary,
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
  const artifactGroup = sql`case
    when ${studioInterview.resumeEvaluationArtifactMode} = 'qualitative'
      or (
        ${studioInterview.resumeEvaluationArtifactMode} is null
        and ${studioInterview.qualitativeRecommendationLevel} is not null
      ) then 0
    when ${studioInterview.resumeEvaluationArtifactMode} = 'structured'
      or (
        ${studioInterview.resumeEvaluationArtifactMode} is null
        and ${studioInterview.structuredCompositeScore} is not null
      ) then 1
    when ${studioInterview.resumeEvaluationArtifactMode} = 'legacy'
      or (
        ${studioInterview.resumeEvaluationArtifactMode} is null
        and ${studioInterview.resumeReview} is not null
      ) then 2
    else 3
  end`;
  const orderBy =
    sortBy === "structuredScore"
      ? [
          asc(artifactGroup),
          asc(studioInterview.structuredGateSortRank),
          desc(studioInterview.structuredCompositeScore),
          desc(
            sql`case when ${artifactGroup} = 2
              then coalesce(
                ${studioInterview.resumeReview}->'overall'->>'baseScore',
                ${studioInterview.resumeReview}->'overall'->>'score'
              )::numeric
              else null end`,
          ),
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
interface ResumeDerivedFields {
  feishuDocumentUrl: string | null;
  hasInterviewRounds: boolean;
  lastInterviewAt: string | null;
  stageProgress: ResumeStageProgress;
}

const EMPTY_DERIVED_FIELDS: ResumeDerivedFields = {
  feishuDocumentUrl: null,
  hasInterviewRounds: false,
  lastInterviewAt: null,
  stageProgress: EMPTY_STAGE_PROGRESS,
};

// 在共享阶段进度之上补充文档链接，组装招聘台列表/详情需要的完整派生字段。
// Composes document links on top of the shared stage-progress bundle.
async function loadResumeDerivedFields(
  candidateIds: string[],
  organizationId: string,
): Promise<Map<string, ResumeDerivedFields>> {
  const ids = uniq(candidateIds.filter(Boolean));
  const [stageProgressById, documentUrls] = await Promise.all([
    loadResumeStageProgress(ids),
    loadLatestFeishuDocumentUrls({ ids, key: "interviewRecordId", organizationId }),
  ]);
  const result = new Map<string, ResumeDerivedFields>();
  for (const id of ids) {
    const bundle = stageProgressById.get(id) ?? {
      lastInterviewAt: null,
      stageProgress: { ...EMPTY_STAGE_PROGRESS },
    };
    result.set(id, {
      feishuDocumentUrl: documentUrls.get(id) ?? null,
      hasInterviewRounds: bundle.stageProgress.aiInterview !== null,
      lastInterviewAt: bundle.lastInterviewAt,
      stageProgress: bundle.stageProgress,
    });
  }
  return result;
}

function toDuplicateMatchSummary(
  value: ResumeDuplicateMatchSummary | undefined,
): ResumeDuplicateMatchSummary | null {
  return value && value.count > 0 ? value : null;
}

function parseStoredJson<TSchema extends z.ZodType>(
  value: JsonValue | null,
  schema: TSchema,
): z.output<TSchema> | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function buildResumeSkills(skills: z.output<typeof resumeSkillsSchema>) {
  const seen = new Set<string>();
  return skills
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

function resolveResumeEvaluationArtifactMode(row: {
  resumeEvaluationArtifactMode: "legacy" | "qualitative" | "structured" | null;
  resumeReviewBaseScore: string | null;
  structuredCompositeScore: number | null;
}) {
  if (row.resumeEvaluationArtifactMode) {
    return row.resumeEvaluationArtifactMode;
  }
  if (row.structuredCompositeScore !== null) {
    return "structured" as const;
  }
  if (row.resumeReviewBaseScore !== null) {
    return "legacy" as const;
  }
  return null;
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
    feishuDocumentUrl: resolvedDerived.feishuDocumentUrl,
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
    qualitativeRecommendationLevel: row.qualitativeRecommendationLevel,
    qualitativeResumeSummary: row.qualitativeResumeSummary,
    resumeEvaluationArtifactMode: resolveResumeEvaluationArtifactMode(row),
    resumeEvaluationAttemptMode: row.resumeEvaluationAttemptMode,
    resumeEvaluationStatus: row.resumeEvaluationStatus,
    resumeFileName: row.resumeFileName,
    resumeParseRetryable: row.resumeParseStatus === "failed" && Boolean(row.resumeStorageKey),
    resumeParseStatus: row.resumeParseStatus,
    resumeProfileSnapshot: buildResumeProfileSnapshot(row),
    resumeReviewBaseScore: parseResumeReviewBaseScore(row.resumeReviewBaseScore),
    resumeReviewError: row.resumeReviewError,
    resumeReviewGeneratedAt: serializeDate(row.resumeReviewGeneratedAt),
    resumeReviewNextStepAction: parseResumeReviewNextStepAction(row.resumeReviewNextStepAction),
    resumeReviewQueuedAt: serializeDate(row.resumeReviewQueuedAt),
    resumeReviewRunId: row.resumeReviewRunId,
    resumeReviewStatus: row.resumeReviewStatus,
    resumeSkills: buildResumeSkills(parseStoredJson(row.resumeSkills, resumeSkillsSchema) ?? []),
    resumeSummary:
      row.qualitativeResumeSummary ??
      row.structuredResumeSummary ??
      row.resumeReviewConclusion ??
      row.notes?.trim() ??
      null,
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
    createdAtBefore?: Date;
    createdAtFrom?: Date;
    search?: string | null;
    textFilters?: string;
    creatorIds?: string[] | null;
    skills?: string[] | null;
    jobDescriptionIds?: string[] | null;
    pipelineStages?: string[] | null;
    outcomes?: string[] | null;
    recommendationLevels?: string[] | null;
    structuredMaxScore?: number | null;
    structuredMinScore?: number | null;
  },
  pagination?: PaginationInput,
  visibilityScope?: RecruitingVisibilityScope,
  knownTotal?: number,
): Promise<PaginatedResumeLibraryResult> {
  const parsedFilters = filtersSchema.parse(filters ?? {});
  const parsedPagination = paginationSchema.parse(paginationInputSchema.parse(pagination ?? {}));
  const requestsStructuredScores =
    parsedPagination.sortBy === "structuredScore" ||
    (parsedFilters.structuredMinScore !== null && parsedFilters.structuredMinScore !== undefined) ||
    (parsedFilters.structuredMaxScore !== null && parsedFilters.structuredMaxScore !== undefined);
  if (requestsStructuredScores) {
    const selectedJobIds = [
      ...new Set((parsedFilters.jobDescriptionIds ?? []).filter((id) => id.trim().length > 0)),
    ];
    const [selectedJobId] = selectedJobIds;
    if (selectedJobIds.length !== 1 || selectedJobId === undefined) {
      throw new ResumeStructuredScoreQueryError("结构化评分排序或筛选必须且只能选择一个岗位。");
    }
    const [selectedJob] = await db
      .select({ evaluationMode: jobDescription.evaluationMode })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, selectedJobId),
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
    loadResumeDerivedFields(recordIds, organizationId),
    listActiveStudioDuplicateMatchSummaries({
      organizationId,
      sourceIds: recordIds,
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
    createdAtBefore?: Date;
    createdAtFrom?: Date;
    search?: string | null;
    textFilters?: string;
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
  const resumeScreeningResult = parseStoredJson(
    rest.resumeScreeningResult,
    resumeScreeningResultSchema,
  );
  const structuredEvaluation = structuredResumeEvaluationV1Schema.safeParse(
    rest.structuredResumeEvaluation,
  );
  const qualitativeEvaluation = qualitativeResumeEvaluationSchema.safeParse(
    rest.qualitativeResumeEvaluation,
  );
  const [derivedFields, duplicateMatches] = await Promise.all([
    loadResumeDerivedFields([rest.id], organizationId),
    listActiveStudioDuplicateMatchSummaries({
      organizationId,
      sourceIds: [rest.id],
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
    qualitativeJobDescriptionVersionId: rest.qualitativeJobDescriptionVersionId,
    qualitativeResumeEvaluation: qualitativeEvaluation.success ? qualitativeEvaluation.data : null,
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
