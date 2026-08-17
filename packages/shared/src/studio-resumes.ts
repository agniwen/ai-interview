import { z } from "zod";
import type { ResumeAnalysisResult, ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview, ResumeReviewAction } from "@arc/db-schema/resume-review";
import type { ResumeDuplicateMatchSummary } from "./resume-duplicates";
import {
  resumeEvaluationStatusMeta,
  resumeEvaluationStatusSchema,
  resumeParseStatusMeta,
  resumeReviewStatusMeta,
} from "@arc/db-schema/studio-interviews";
import type {
  CandidateExpectationsMeta,
  CandidateOutcome,
  ClosedMeta,
  HumanInterviewRoundOutcome,
  HumanInterviewRoundStatus,
  OfferDraftStatus,
  PipelineStage,
  ResumeEvaluationStatus,
  ResumeParseStatus,
  ResumeReviewStatus,
  ResumeScreeningStatus,
  ScheduleEntryStatus,
} from "@arc/db-schema/studio-interviews";
import type { ResumeScreeningResult } from "./resume-screening";
import type {
  StructuredResumeEvaluationV1,
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "@arc/db-schema/structured-resume-evaluation";
import type { JobEvaluationMode } from "@arc/db-schema/job-description-evaluation";

/**
 * AI 面试阶段的派生进度：从 studio_interview_schedule 聚合。
 * - activeRound 为 null 表示要么全部完成、要么还没排期（结合 totalRounds 区分）
 * Derived AI-interview progress aggregated from studio_interview_schedule.
 */
export interface AiInterviewProgress {
  totalRounds: number;
  completedRounds: number;
  hasStarted: boolean;
  activeRound: {
    sortOrder: number;
    roundLabel: string;
    status: ScheduleEntryStatus;
  } | null;
}

/**
 * 真人复面阶段的派生进度：从 studio_human_interview_round 聚合。
 * 不计 cancelled 轮次到 totalRounds，避免被取消的轮次干扰「全部完成」的判定。
 * Derived human-interview progress; cancelled rounds excluded from totals.
 */
export interface HumanInterviewProgress {
  totalRounds: number;
  completedRounds: number;
  completedRoundsMissingFeedback: number;
  passedRounds: number;
  failedRounds: number;
  activeRound: {
    id: string;
    sortOrder: number;
    label: string;
    status: HumanInterviewRoundStatus;
    outcome: HumanInterviewRoundOutcome | null;
    scheduledAt: string | null;
  } | null;
}

/**
 * Offer 阶段的派生进度：从 studio_offer_draft 聚合。
 * latestDraft = 最高 version 且非 superseded 的那条；UI 只需要知道当前那一版的状态。
 * Derived offer progress; latestDraft = newest non-superseded version.
 */
export interface OfferProgress {
  totalVersions: number;
  latestDraft: {
    id: string;
    version: number;
    status: OfferDraftStatus;
    sentAt: string | null;
    responseAt: string | null;
  } | null;
}

/**
 * 三种阶段进度组合而成的 stageProgress；DAO 一次查询全部返回，UI 根据当前 pipelineStage 选用。
 * 各子结构在没有相关数据时为 null（而非空对象），方便组件做 `?.` 守卫。
 *
 * Aggregated per-stage progress returned by the DAO; consumers pick the
 * sub-structure matching the candidate's current pipelineStage.
 */
export interface ResumeStageProgress {
  aiInterview: AiInterviewProgress | null;
  humanInterview: HumanInterviewProgress | null;
  offer: OfferProgress | null;
}

export interface ResumeLibraryProfileSnapshotLine {
  period: string | null;
  primary: string;
  secondary: string | null;
}

/**
 * Compact resume profile projection for list / match cards.
 * Library list cards use work + education only; duplicate-match cards may also
 * include projects (recent 3 companies / 2 education / 3 projects).
 */
export interface ResumeLibraryProfileSnapshot {
  education: ResumeLibraryProfileSnapshotLine[];
  educationHasMore: boolean;
  projects: ResumeLibraryProfileSnapshotLine[];
  projectsHasMore: boolean;
  work: ResumeLibraryProfileSnapshotLine[];
  workHasMore: boolean;
}

export const EMPTY_RESUME_PROFILE_SNAPSHOT: ResumeLibraryProfileSnapshot = {
  education: [],
  educationHasMore: false,
  projects: [],
  projectsHasMore: false,
  work: [],
  workHasMore: false,
};

/**
 * 招聘台列表行 DTO。AI 面试列表的精简投影：去掉 status / interviewQuestions /
 * scheduleEntries 等面试态字段，只保留候选人 / 简历 / 创建者维度。
 *
 * Resume library list row. A trimmed projection of the interview list — interview
 * status, generated questions and schedule entries are intentionally dropped so
 * the resume library view stays focused on candidate + resume metadata.
 */
export interface ResumeLibraryListRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  notes: string | null;
  jobDescriptionId: string | null;
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
  jobEvaluationMode: JobEvaluationMode | null;
  resumeFileName: string | null;
  // 列表卡片轻量投影：从 resume_review jsonb 抽出，避免整包下发。
  // Lightweight card projection extracted from resume_review jsonb.
  resumeReviewBaseScore: number | null;
  resumeReviewNextStepAction: ResumeReviewAction | null;
  resumeReviewStatus: ResumeReviewStatus;
  resumeReviewError: string | null;
  resumeReviewGeneratedAt: string | null;
  resumeReviewQueuedAt: string | null;
  resumeReviewRunId: string | null;
  resumeEvaluationStatus: ResumeEvaluationStatus | null;
  resumeEvaluationArtifactMode: JobEvaluationMode | null;
  resumeEvaluationAttemptMode: JobEvaluationMode | null;
  structuredCompositeScore: number | null;
  structuredGateSortRank: number | null;
  structuredGateStatus: StructuredResumeGateStatus | null;
  structuredScoreGrade: StructuredResumeGrade | null;
  resumeSummary: string | null;
  resumeParseStatus: ResumeParseStatus;
  resumeParseRetryable: boolean;
  resumeSkills: string[];
  resumeProfileSnapshot: ResumeLibraryProfileSnapshot;
  hasResumeFile: boolean;
  duplicateMatch: ResumeDuplicateMatchSummary | null;
  feishuDocumentUrl: string | null;
  // 是否已存在至少一个 AI 面试轮次（studioInterviewSchedule）。
  // Whether this candidate already has at least one AI interview round.
  hasInterviewRounds: boolean;
  // 候选人所在 pipeline 阶段（screening / written_test / ai_interview /
  // human_interview / offer / closed）。
  pipelineStage: PipelineStage;
  // 最终结论（in_pipeline / hired / rejected / withdrawn / archived）。
  // 不变量：outcome !== 'in_pipeline' ⇔ pipelineStage === 'closed'。
  outcome: CandidateOutcome;
  // 派生的当前阶段进度信息；目前仅 ai_interview 阶段会有 schedule 数据。
  // Derived progress for the current stage; only ai_interview produces
  // schedule data today, others are placeholders.
  stageProgress: ResumeStageProgress;
  createdAt: string;
  updatedAt: string;
  // 最近一次面试时间（AI 轮次或真人轮次的 max scheduledAt），无任何轮次则为 null。
  // Latest interview scheduledAt across AI + human rounds, or null when none exist.
  lastInterviewAt: string | null;
  createdBy: string | null;
  creatorName: string | null;
  creatorImage: string | null;
}

/**
 * 单条详情 DTO：列表字段 + interviewQuestions。
 *
 * Detail DTO: list fields plus any `interviewQuestions` generated during upload
 * (may be empty for legacy rows).
 */
export interface ResumeLibraryDetail extends ResumeLibraryListRecord {
  candidateExpectationsMeta: CandidateExpectationsMeta | null;
  closedAt: string | null;
  closedMeta: ClosedMeta | null;
  closedReason: string | null;
  creatorOrganizationName: string | null;
  hrResumeAssessment: string | null;
  hrResumeAssessmentUpdatedAt: string | null;
  hrResumeAssessmentUpdatedBy: string | null;
  humanInterviewerId: string | null;
  humanInterviewScheduledAt: string | null;
  resumeProfile: ResumeProfile | null;
  resumeReview: ResumeReview | null;
  resumeContentHash: string | null;
  resumeEvaluationStatus: ResumeEvaluationStatus | null;
  resumeParsedAt: string | null;
  resumeParseError: string | null;
  resumeReviewError: string | null;
  resumeReviewGeneratedAt: string | null;
  resumeReviewQueuedAt: string | null;
  structuredResumeEvaluation: StructuredResumeEvaluationV1 | null;
  resumeScreeningError: string | null;
  resumeScreeningEvaluatedAt: string | null;
  resumeScreeningResult: ResumeScreeningResult | null;
  resumeScreeningStale: boolean;
  resumeScreeningStatus: ResumeScreeningStatus;
  offerAcceptedAt: string | null;
  offerSentAt: string | null;
  writtenTestScheduledAt: string | null;
  writtenTestScore: string | null;
  interviewQuestions: ResumeAnalysisResult["interviewQuestions"];
}

// ── 阶段子描述函数：每段独立逻辑，方便单测 ──
// Per-stage sub-describers; pure functions, easy to unit-test.

interface Description {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
}

interface ResumeProgressInput {
  pipelineStage: PipelineStage;
  outcome: CandidateOutcome;
  resumeParseStatus?: ResumeParseStatus;
  resumeReviewStatus?: ResumeReviewStatus;
  stageProgress: ResumeStageProgress;
}

interface ResumeEvaluationStatusDescription {
  label: string;
  tone: "outline" | "success" | "danger";
}

function describeAiInterview(p: AiInterviewProgress | null): Description {
  if (!p || p.totalRounds === 0) {
    return { label: "AI 面试 · 未排期", tone: "outline" };
  }
  if (p.activeRound === null) {
    return {
      label: `AI 面试 · 已完成 (${p.completedRounds}/${p.totalRounds}) · 待决策`,
      tone: "success",
    };
  }
  // sortOrder 从 0 起，展示时 +1 给「第 X 轮」语义。
  const roundIndex = p.activeRound.sortOrder + 1;
  const isActive = p.activeRound.status === "in_progress" || p.activeRound.status === "interrupted";
  if (isActive) {
    return {
      label: `AI 面试 · 第 ${roundIndex}/${p.totalRounds} 轮 · 进行中`,
      tone: "warning",
    };
  }
  const subLabel = p.hasStarted ? "等候下一轮" : "等候候选人进场";
  return {
    label: `AI 面试 · 第 ${roundIndex}/${p.totalRounds} 轮 · ${subLabel}`,
    tone: "info",
  };
}

function describeHumanInterview(p: HumanInterviewProgress | null): Description {
  if (!p || p.totalRounds === 0) {
    return { label: "真人复面 · 未安排", tone: "outline" };
  }
  if (p.activeRound === null) {
    // 全部完成 → 展示通过/未通过统计 + 待决策。
    // All rounds done → show pass/fail tally and await HR decision.
    return {
      label: `真人复面 · 全部完成 (${p.passedRounds}/${p.totalRounds} 通过) · 待决策`,
      tone: "success",
    };
  }
  const roundIndex = p.activeRound.sortOrder + 1;
  // 真人复面没有 in_progress 实时态，只有「已安排 / 待安排」两种 pending 子态。
  // Human interview has no live in_progress; pending = scheduled or unscheduled.
  const subLabel = p.activeRound.scheduledAt ? "已安排" : "待安排";
  return {
    label: `真人复面 · 第 ${roundIndex}/${p.totalRounds} 轮（${p.activeRound.label}）· ${subLabel}`,
    tone: "info",
  };
}

function describeOffer(p: OfferProgress | null): Description {
  if (!p || p.totalVersions === 0 || !p.latestDraft) {
    return { label: "Offer · 待发出", tone: "outline" };
  }
  const { latestDraft } = p;
  const versionSuffix = p.totalVersions > 1 ? ` v${latestDraft.version}` : "";
  switch (latestDraft.status) {
    case "draft": {
      return { label: `Offer${versionSuffix} · 草稿`, tone: "outline" };
    }
    case "sent": {
      return { label: `Offer${versionSuffix} · 已发送 · 等响应`, tone: "info" };
    }
    case "accepted": {
      return { label: `Offer${versionSuffix} · 已接受 · 待结案`, tone: "success" };
    }
    case "declined": {
      return { label: `Offer${versionSuffix} · 已拒绝`, tone: "outline" };
    }
    case "expired": {
      return { label: `Offer${versionSuffix} · 已过期`, tone: "outline" };
    }
    default: {
      return { label: "Offer · 待回复", tone: "info" };
    }
  }
}

/**
 * 把（pipelineStage, outcome, stageProgress）一句话翻译成 UI 想展示的进度文本 + tone。
 * 单一来源——招聘台列表、详情面板、卡片视图都从这里拿，避免文案各处分叉。
 *
 * Reduce (pipelineStage, outcome, stageProgress) to a single display string +
 * tone for the resume library "面试进度" cell, detail panel, and elsewhere.
 */
export function describeResumeProgress(record: ResumeProgressInput): Description {
  const { pipelineStage, outcome, resumeParseStatus, resumeReviewStatus, stageProgress } = record;

  if (resumeParseStatus && resumeParseStatus !== "ready") {
    const meta = resumeParseStatusMeta[resumeParseStatus];
    return { label: meta.label, tone: meta.tone };
  }
  if (
    pipelineStage === "screening" &&
    (resumeReviewStatus === "queued" || resumeReviewStatus === "processing")
  ) {
    return { label: "简历筛选 · 分析中", tone: "warning" };
  }

  // closed 阶段：用 outcome 决定标签和色调。
  if (pipelineStage === "closed") {
    switch (outcome) {
      case "hired": {
        return { label: "已结案 · 已录用", tone: "success" };
      }
      case "rejected": {
        return { label: "已结案 · 已淘汰", tone: "outline" };
      }
      case "withdrawn": {
        return { label: "已结案 · 已撤回", tone: "outline" };
      }
      case "archived": {
        return { label: "已归档", tone: "outline" };
      }
      default: {
        return { label: "已结案", tone: "outline" };
      }
    }
  }

  switch (pipelineStage) {
    case "screening": {
      return { label: "简历筛选 · 待处理", tone: "outline" };
    }
    case "written_test": {
      return { label: "笔试 · 待安排", tone: "info" };
    }
    case "ai_interview": {
      return describeAiInterview(stageProgress.aiInterview);
    }
    case "human_interview": {
      return describeHumanInterview(stageProgress.humanInterview);
    }
    case "offer": {
      return describeOffer(stageProgress.offer);
    }
    default: {
      return { label: pipelineStage, tone: "outline" };
    }
  }
}

export interface PaginatedResumeLibraryResult {
  records: ResumeLibraryListRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const RESUME_LIBRARY_INFINITE_PAGE_SIZE = 20;
export const resumeLibrarySortIds = [
  "createdAt",
  "candidateName",
  "structuredScore",
  "updatedAt",
] as const;
export type ResumeLibrarySortId = (typeof resumeLibrarySortIds)[number];

export function canEditResumeRecord(status: ResumeParseStatus): boolean {
  return status === "ready";
}

export function canLaunchInterviewFromResume(status: ResumeParseStatus): boolean {
  return status === "ready";
}

export function canDeleteResumeRecord(status: ResumeParseStatus): boolean {
  return status !== "queued" && status !== "processing";
}

export function getResumeActionLockedReason(status: ResumeParseStatus): string | null {
  if (status === "ready") {
    return null;
  }
  return `${resumeParseStatusMeta[status].label}的简历暂不可操作。`;
}

export const resumeEvaluationStatusValues = ["pass", "fail"] as const;
export const resumeEvaluationStatusInputSchema = resumeEvaluationStatusSchema;
export const resumeEvaluationStatusFormValueSchema = z.union([
  resumeEvaluationStatusSchema,
  z.literal("unreviewed"),
]);
export const resumeEvaluationStatusSubmitSchema = z.object({
  status: resumeEvaluationStatusSchema,
});
export const resumeEvaluationUpdateSchema = z.object({
  status: resumeEvaluationStatusSchema.nullable(),
});

export { resumeEvaluationStatusSchema };
export type { ResumeEvaluationStatus };
export type ResumeEvaluationStatusFormValue = z.infer<typeof resumeEvaluationStatusFormValueSchema>;

export function describeResumeEvaluationStatus(
  status: ResumeEvaluationStatus | null,
): ResumeEvaluationStatusDescription {
  if (!status) {
    return { label: "未评估", tone: "outline" };
  }
  return resumeEvaluationStatusMeta[status];
}

export function describeResumeReviewStatus(status: ResumeReviewStatus) {
  return resumeReviewStatusMeta[status];
}

export type CandidateTimelineEventKind =
  | "candidate"
  | "stage"
  | "ai_interview"
  | "human_interview"
  | "offer"
  | "form"
  | "email"
  | "notification"
  | "audit";

export type CandidateTimelineEventTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export interface CandidateTimelineEventMeta {
  label: string;
  value: string;
}

export interface CandidateTimelineEvent {
  id: string;
  kind: CandidateTimelineEventKind;
  tone: CandidateTimelineEventTone;
  title: string;
  description: string | null;
  occurredAt: string;
  actorName: string | null;
  actorImage: string | null;
  metadata: CandidateTimelineEventMeta[];
}

export interface CandidateTimelineResponse {
  events: CandidateTimelineEvent[];
  summary: {
    totalEvents: number;
    latestAt: string | null;
    currentStageLabel: string;
    currentOutcomeLabel: string;
  };
}

/**
 * 表单 schema（创建 / 编辑共用）。比 studioInterviewFormSchema 宽松：
 *   - 不要求至少一轮 scheduleEntries
 *   - 不需要 status（始终 draft）
 * 候选人姓名可空：服务端会用解析结果回填，最终落库时强制非空（兜底"未命名候选人"）。
 *
 * Create / edit form schema. Looser than `studioInterviewFormSchema`:
 *   - no schedule entries required
 *   - no status field (always draft)
 * `candidateName` may be empty — the server falls back to the parsed profile
 * name (and finally "未命名候选人" if the resume has no name either).
 */
export const resumeLibraryFormSchema = z.object({
  candidateEmail: z
    .string()
    .trim()
    .max(200, "邮箱不能超过 200 个字符")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "请输入有效邮箱",
    }),
  candidateName: z.string().trim().max(120, "候选人姓名不能超过 120 个字符"),
  candidatePhone: z.string().trim().max(40, "联系电话不能超过 40 个字符"),
  hrResumeAssessment: z.string().trim().max(2000, "HR 评价不能超过 2000 字"),
  jobDescriptionId: z.string().trim().min(1, "请选择关联在招岗位").max(100, "关联在招岗位无效"),
  notes: z.string().trim().max(2000, "备注不能超过 2000 字"),
  resumeEvaluationStatus: resumeEvaluationStatusFormValueSchema,
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
});

export const resumeLibraryEditFormSchema = resumeLibraryFormSchema.extend({
  candidateName: z
    .string()
    .trim()
    .min(1, "请填写候选人姓名")
    .max(120, "候选人姓名不能超过 120 个字符"),
});

export type ResumeLibraryFormValues = z.infer<typeof resumeLibraryFormSchema>;

/**
 * Lightweight identity edit from the resume overview "候选人信息" section.
 * Updates table columns and mirrors into resumeProfile JSON when present.
 */
export const resumeIdentityUpdateSchema = z.object({
  age: z.number().int().min(0).max(120).nullable(),
  candidateEmail: z
    .string()
    .trim()
    .max(200, "邮箱不能超过 200 个字符")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, {
      message: "请输入有效邮箱",
    }),
  candidateName: z
    .string()
    .trim()
    .min(1, "请填写候选人姓名")
    .max(120, "候选人姓名不能超过 120 个字符"),
  candidatePhone: z.string().trim().max(40, "联系电话不能超过 40 个字符"),
  gender: z.string().trim().max(40),
  jobDescriptionId: z.string().trim().min(1, "请选择关联在招岗位").max(100, "关联在招岗位无效"),
  resumeEvaluationStatus: resumeEvaluationStatusFormValueSchema,
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
  workYears: z.number().min(0).max(80).nullable(),
});

export type ResumeIdentityUpdateInput = z.infer<typeof resumeIdentityUpdateSchema>;

export function createResumeLibraryFormValues(): ResumeLibraryFormValues {
  return {
    candidateEmail: "",
    candidateName: "",
    candidatePhone: "",
    hrResumeAssessment: "",
    jobDescriptionId: "",
    notes: "",
    resumeEvaluationStatus: "unreviewed",
    targetRole: "",
  };
}

/**
 * 招聘台页头部 chart 的聚合数据。
 * - byPipeline：按 pipelineStage × outcome 分组的候选人数；outcome='archived' 排除。
 * - dailyAdded：近一年（365 天）每日新增；服务端只返回有数据的日期，零填充由客户端补。
 *   每日附带 byUser 拆分，供 GitHub 风格日历热力图 hover 展示各上传者数量。
 * - conversion：是否已发起 AI 面试的对比（archived 排除）。
 *
 * Aggregations for the charts shown above the resume-library table.
 * - byPipeline: candidate count grouped by (pipelineStage, outcome). Archived
 *   outcomes are excluded so the funnel reflects the live pool.
 * - dailyAdded: daily new rows over the last 365 days; only non-empty days are
 *   returned, the client zero-fills the year calendar grid. Each day may include
 *   byUser for contribution-style tooltips (who uploaded how many that day).
 * - conversion: how many candidates have already launched an AI interview
 *   round vs not (archived excluded).
 */
export interface ResumeLibraryDailyAddedUserCount {
  count: number;
  userId: string;
  userName: string;
}

export interface ResumeLibraryDailyAdded {
  byUser: ResumeLibraryDailyAddedUserCount[];
  count: number;
  day: string;
}

export interface ResumeLibraryMetrics {
  byPipeline: { stage: PipelineStage; outcome: CandidateOutcome; count: number }[];
  dailyAdded: ResumeLibraryDailyAdded[];
  conversion: { withInterview: number; withoutInterview: number };
}
