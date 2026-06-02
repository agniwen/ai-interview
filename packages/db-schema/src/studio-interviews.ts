import type { ResumeAnalysisResult } from "./interview/types";
import { z } from "zod";

// ⚠️ DEPRECATED — 旧的 record 级 status，被 pipelineStage + outcome 两维取代。
// 仍然保留导出 + DB 列继续被写入，等所有读侧切到新字段后再说删除。
// Legacy single-axis status. Superseded by pipelineStage + outcome. Kept
// exported and dual-written from app code until consumers fully migrate.
export const studioInterviewStatusValues = [
  "draft",
  "ready",
  "in_progress",
  "completed",
  "archived",
] as const;

export const studioInterviewStatusSchema = z.enum(studioInterviewStatusValues);

// ── 新模型：pipelineStage（候选人在 pipeline 哪个阶段）+ outcome（最终结论）──
// Two-axis replacement for the legacy status enum: an explicit "where in the
// hiring pipeline" stage, plus a separate "what's the verdict" outcome.

// 顺序对应招聘漏斗：简历筛选 → 笔试 → AI 面试 → 真人复面 → offer → 结案。
// closed 是终态，outcome 字段决定具体结局（hired/rejected/withdrawn/archived）。
// Funnel order: screening → written_test → ai_interview → human_interview →
// offer → closed (terminal; outcome describes the verdict).
export const pipelineStageValues = [
  "screening",
  "written_test",
  "ai_interview",
  "human_interview",
  "offer",
  "closed",
] as const;

export const pipelineStageSchema = z.enum(pipelineStageValues);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const pipelineStageMeta: Record<
  PipelineStage,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  ai_interview: { label: "AI 面试", tone: "warning" },
  closed: { label: "已结案", tone: "outline" },
  human_interview: { label: "真人复面", tone: "warning" },
  offer: { label: "Offer", tone: "info" },
  screening: { label: "简历筛选", tone: "outline" },
  written_test: { label: "笔试", tone: "info" },
};

// 候选人最终结论：in_pipeline 表示还在流程中（默认），其余四种都对应 pipelineStage='closed'。
// withdrawn = 候选人主动撤回；archived = 冷藏（不删但不在主视图）。
// Outcome verdicts: in_pipeline is the default (still active); the other four
// always pair with pipelineStage='closed'.
export const candidateOutcomeValues = [
  "in_pipeline",
  "hired",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export const candidateOutcomeSchema = z.enum(candidateOutcomeValues);
export type CandidateOutcome = z.infer<typeof candidateOutcomeSchema>;

export const candidateOutcomeMeta: Record<
  CandidateOutcome,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  archived: { label: "已归档", tone: "outline" },
  hired: { label: "已录用", tone: "success" },
  in_pipeline: { label: "进行中", tone: "info" },
  rejected: { label: "已淘汰", tone: "outline" },
  withdrawn: { label: "已撤回", tone: "outline" },
};

// 不变量：outcome !== 'in_pipeline' ⇔ pipelineStage === 'closed'。
// DB 端用 CHECK 约束兜底，应用层在写入时也应当一致。
// Invariant: outcome !== 'in_pipeline' iff pipelineStage === 'closed'.
// Enforced by a CHECK constraint at the DB layer; app-layer writers should
// keep the pair consistent.

// ── 真人复面阶段 / Human Interview Stage ──

// 单轮状态：pending（已排期/未排期）→ completed / cancelled（终态）。
// 不区分 in_progress——线下面试由 HR 手动标完成，没有「正在进行」的实时态。
// Round states: pending → completed/cancelled (terminal). No in_progress
// because human interviews are marked done manually by HR, no live signal.
export const humanInterviewRoundStatusValues = ["pending", "completed", "cancelled"] as const;
export const humanInterviewRoundStatusSchema = z.enum(humanInterviewRoundStatusValues);
export type HumanInterviewRoundStatus = z.infer<typeof humanInterviewRoundStatusSchema>;

export const humanInterviewRoundOutcomeValues = ["pass", "fail", "inconclusive"] as const;
export const humanInterviewRoundOutcomeSchema = z.enum(humanInterviewRoundOutcomeValues);
export type HumanInterviewRoundOutcome = z.infer<typeof humanInterviewRoundOutcomeSchema>;

export const humanInterviewRoundOutcomeMeta: Record<
  HumanInterviewRoundOutcome,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  fail: { label: "未通过", tone: "outline" },
  inconclusive: { label: "待定", tone: "info" },
  pass: { label: "通过", tone: "success" },
};

export const humanInterviewFormatValues = ["online", "onsite", "phone"] as const;
export const humanInterviewFormatSchema = z.enum(humanInterviewFormatValues);
export type HumanInterviewFormat = z.infer<typeof humanInterviewFormatSchema>;

export const humanInterviewFormatMeta: Record<HumanInterviewFormat, { label: string }> = {
  online: { label: "线上" },
  onsite: { label: "线下" },
  phone: { label: "电话" },
};

const EXPLICIT_TIMEZONE_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function isExplicitTimezoneDateTimeString(value: string) {
  const trimmed = value.trim();
  return EXPLICIT_TIMEZONE_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed));
}

export const nullableInstantDateTimeInputSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine(
    (value) =>
      value === null ||
      value === undefined ||
      value === "" ||
      isExplicitTimezoneDateTimeString(value),
    {
      message: "时间必须包含明确的时区信息。",
    },
  );

// 真人复面会议状态：会议级生命周期，和候选人单轮评价状态分开。
// Human-interview meeting lifecycle. Kept separate from per-candidate round
// verdicts so a group interview can produce multiple independent evaluations.
export const humanInterviewMeetingStatusValues = [
  "scheduled",
  "in_progress",
  "ended",
  "cancelled",
] as const;
export const humanInterviewMeetingStatusSchema = z.enum(humanInterviewMeetingStatusValues);
export type HumanInterviewMeetingStatus = z.infer<typeof humanInterviewMeetingStatusSchema>;

export const humanInterviewMeetingInterviewerRoleValues = [
  "host",
  "interviewer",
  "observer",
] as const;
export const humanInterviewMeetingInterviewerRoleSchema = z.enum(
  humanInterviewMeetingInterviewerRoleValues,
);
export type HumanInterviewMeetingInterviewerRole = z.infer<
  typeof humanInterviewMeetingInterviewerRoleSchema
>;

// 复面轮次输入 schema（创建 + 编辑共用，部分字段编辑时可选）。
// 至少一名面试官；时间可空（未定档）；评分 0-100，可空。
// Round input schema; interviewers must be non-empty, scheduledAt may be null,
// score range 0-100.
export const humanInterviewRoundInputSchema = z.object({
  feedback: z.string().trim().max(5000, "面试反馈不能超过 5000 字").nullable().optional(),
  format: humanInterviewFormatSchema,
  interviewerIds: z
    .array(z.string().trim().min(1))
    .min(1, "至少添加 1 位面试官")
    .max(10, "面试官最多 10 人"),
  label: z.string().trim().min(1, "请输入轮次名称").max(50, "轮次名称不能超过 50 字"),
  location: z.string().trim().max(200).nullable().optional(),
  meetingUrl: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  outcome: humanInterviewRoundOutcomeSchema.nullable().optional(),
  scheduledAt: nullableInstantDateTimeInputSchema,
  score: z.number().int().min(0).max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type HumanInterviewRoundInput = z.infer<typeof humanInterviewRoundInputSchema>;

export const humanInterviewMeetingInputSchema = z.object({
  interviewerIds: z
    .array(z.string().trim().min(1))
    .min(1, "至少添加 1 位面试官")
    .max(20, "面试官最多 20 人"),
  notes: z.string().trim().max(1000, "会议备注不能超过 1000 字").nullable().optional(),
  roundIds: z
    .array(z.string().trim().min(1))
    .min(1, "至少添加 1 位候选人")
    .max(20, "候选人最多 20 人"),
  scheduledAt: nullableInstantDateTimeInputSchema,
  title: z.string().trim().min(1, "请输入会议名称").max(100, "会议名称不能超过 100 字"),
});
export type HumanInterviewMeetingInput = z.infer<typeof humanInterviewMeetingInputSchema>;

// ── Offer 阶段 / Offer Stage ──

// Offer 状态机：
//   draft → sent → (accepted / declined / expired)
//   任意时刻可被新版本 supersede（旧版状态变 superseded，新版从 draft 开始）
// Offer state machine; any draft can be superseded when a new version is issued.
export const offerDraftStatusValues = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "superseded",
] as const;
export const offerDraftStatusSchema = z.enum(offerDraftStatusValues);
export type OfferDraftStatus = z.infer<typeof offerDraftStatusSchema>;

export const offerDraftStatusMeta: Record<
  OfferDraftStatus,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  accepted: { label: "已接受", tone: "success" },
  declined: { label: "已拒绝", tone: "outline" },
  draft: { label: "草稿", tone: "outline" },
  expired: { label: "已过期", tone: "outline" },
  sent: { label: "已发送", tone: "info" },
  superseded: { label: "已被新版替代", tone: "outline" },
};

// Offer 输入 schema：薪资以「元」为单位（integer），currency 默认 CNY。
// Salary stored as integer "元" (CNY cents not used early-stage; CNY is dominant).
export const offerDraftInputSchema = z.object({
  baseSalary: z.number().int().min(0, "Base salary 不能为负"),
  bonus: z.number().int().min(0).nullable().optional(),
  candidateCounter: z.string().trim().max(2000).nullable().optional(),
  currency: z.string().trim().min(1).max(8).default("CNY").optional(),
  equity: z.string().trim().max(500).nullable().optional(),
  expiresAt: z.string().trim().nullable().optional(),
  joiningDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  position: z.string().trim().min(1, "请填写职位").max(200),
});
export type OfferDraftInput = z.infer<typeof offerDraftInputSchema>;

// 响应 offer 时的 patch shape：HR 录入候选人反馈。
// HR records the candidate's response to a sent offer.
export const offerResponseInputSchema = z.object({
  candidateCounter: z.string().trim().max(2000).nullable().optional(),
  response: z.enum(["accepted", "declined", "counter"]),
});
export type OfferResponseInput = z.infer<typeof offerResponseInputSchema>;

// ── 候选人期望 / 结案元数据（单行 JSONB，不需要子表）──

// 候选人期望（在 offer 阶段录入，后续 dialog prefill 用）。
// Candidate expectations; populated during the offer flow and used to prefill.
export const candidateExpectationsMetaSchema = z.object({
  currentSalary: z.number().int().min(0).nullable().optional(),
  earliestJoiningDate: z.string().trim().nullable().optional(),
  expectedSalary: z.number().int().min(0).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CandidateExpectationsMeta = z.infer<typeof candidateExpectationsMetaSchema>;

// 结案大类（淘汰原因 / 撤回原因等的归一化分类）。
// Normalized closure category for downstream stats and recall flows.
export const closeCategoryValues = [
  "skills_mismatch",
  "culture_fit",
  "comp_disagreement",
  "candidate_withdrew",
  "position_filled",
  "other",
] as const;
export const closeCategorySchema = z.enum(closeCategoryValues);
export type CloseCategory = z.infer<typeof closeCategorySchema>;

export const closeCategoryMeta: Record<CloseCategory, { label: string }> = {
  candidate_withdrew: { label: "候选人放弃" },
  comp_disagreement: { label: "薪资分歧" },
  culture_fit: { label: "文化不符" },
  other: { label: "其他" },
  position_filled: { label: "岗位已招满" },
  skills_mismatch: { label: "技能不匹配" },
};

// 录用专属细节（outcome=hired 时填）。
// Hired-only details; recorded when outcome=hired.
export const closedHiredDetailsSchema = z.object({
  actualJoiningDate: z.string().trim().nullable().optional(),
  finalBaseSalary: z.number().int().min(0).nullable().optional(),
  finalPosition: z.string().trim().max(200).nullable().optional(),
  onboardingContact: z.string().trim().max(200).nullable().optional(),
});
export type ClosedHiredDetails = z.infer<typeof closedHiredDetailsSchema>;

// 淘汰专属细节（outcome=rejected 时填）。
// Rejected-only details; recorded when outcome=rejected.
export const closedRejectionDetailsSchema = z.object({
  revisitAfter: z.string().trim().nullable().optional(),
  talentPoolEligible: z.boolean().default(false).optional(),
});
export type ClosedRejectionDetails = z.infer<typeof closedRejectionDetailsSchema>;

// 结案元数据合并 schema：所有字段都可选，按 outcome 类型有意义不同的子树。
// 同时记 previousStage，给 reactivate 恢复用。
// Aggregated closed metadata; previousStage powers reactivate-restore.
export const closedMetaSchema = z.object({
  category: closeCategorySchema.nullable().optional(),
  feedbackToCandidate: z.string().trim().max(5000).nullable().optional(),
  hiredDetails: closedHiredDetailsSchema.nullable().optional(),
  internalNotes: z.string().trim().max(5000).nullable().optional(),
  previousStage: pipelineStageSchema.nullable().optional(),
  rejectionDetails: closedRejectionDetailsSchema.nullable().optional(),
});
export type ClosedMeta = z.infer<typeof closedMetaSchema>;

// 轮次状态机：pending → in_progress → (interrupted ↔ in_progress) → completed。
// interrupted 表示候选人临时断连，仍可在 3 分钟宽限内回到同一房间继续。
// Schedule round states: pending → in_progress → (interrupted ↔ in_progress) →
// completed. "interrupted" indicates a transient disconnect during which the
// candidate can rejoin the same room within a 3-minute grace window.
export const scheduleEntryStatusValues = [
  "pending",
  "in_progress",
  "interrupted",
  "completed",
] as const;

export const scheduleEntryStatusSchema = z.enum(scheduleEntryStatusValues);

export type ScheduleEntryStatus = z.infer<typeof scheduleEntryStatusSchema>;

export const scheduleEntryStatusMeta: Record<
  ScheduleEntryStatus,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  completed: { label: "已结束", tone: "success" },
  in_progress: { label: "进行中", tone: "warning" },
  interrupted: { label: "进行中", tone: "warning" },
  pending: { label: "待开始", tone: "info" },
};

// 热重连宽限期：候选人断连后允许在该窗口内拿同一房间名续连。
// Hot-reconnect grace window during which a disconnected candidate can rejoin
// the same LiveKit room with the same participant identity.
export const RECONNECT_GRACE_MS = 3 * 60 * 1000;

export const studioInterviewScheduleEntrySchema = z.object({
  allowTextInput: z.boolean(),
  id: z.string().trim().optional(),
  notes: z.string().trim().max(1000, "轮次备注不能超过 1000 字").optional().or(z.literal("")),
  roundLabel: z.string().trim().min(1, "请输入面试轮次").max(100, "面试轮次不能超过 100 个字符"),
  scheduledAt: z.string().trim().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0),
});

export const studioInterviewBaseSchema = z.object({
  candidateEmail: z.string().trim().email("请输入有效邮箱").or(z.literal("")),
  candidateName: z
    .string()
    .trim()
    .min(1, "请输入候选人姓名")
    .max(120, "候选人姓名不能超过 120 个字符"),
  candidatePhone: z.string().trim().max(40, "联系电话不能超过 40 个字符").or(z.literal("")),
  jobDescriptionId: z.string().trim().min(1, "请选择在招岗位"),
  notes: z.string().trim().max(2000, "备注不能超过 2000 字"),
  scheduleEntries: z
    .array(studioInterviewScheduleEntrySchema)
    .min(1, "至少添加一轮面试安排")
    .superRefine((entries, context) => {
      const seenOrder = new Set<number>();

      for (const entry of entries) {
        if (seenOrder.has(entry.sortOrder)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "面试轮次顺序不能重复",
          });
          return;
        }

        seenOrder.add(entry.sortOrder);

        if (entry.scheduledAt && Number.isNaN(Date.parse(entry.scheduledAt))) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "请输入有效的面试时间",
          });
          return;
        }
      }
    }),
  status: studioInterviewStatusSchema,
  targetRole: z.string().trim().max(120, "目标岗位不能超过 120 个字符"),
});

function validateScheduleEntryInstants(
  entries: StudioInterviewScheduleEntryFormValue[],
  context: z.RefinementCtx,
) {
  for (const [index, entry] of entries.entries()) {
    if (entry.scheduledAt && !isExplicitTimezoneDateTimeString(entry.scheduledAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "面试时间必须包含明确的时区信息。",
        path: ["scheduleEntries", index, "scheduledAt"],
      });
    }
  }
}

export const studioInterviewFormSchema = studioInterviewBaseSchema.superRefine((value, context) => {
  validateScheduleEntryInstants(value.scheduleEntries, context);
});
export const studioInterviewUpdateSchema = studioInterviewFormSchema;

export const studioInterviewQuestionClientSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
  order: z.number().int().min(1),
  question: z.string().trim().min(1, "题目内容不能为空").max(1000, "单道题目不能超过 1000 字"),
});

export const studioInterviewClientFormSchema = studioInterviewBaseSchema.extend({
  interviewQuestions: z
    .array(studioInterviewQuestionClientSchema)
    .max(50, "最多只能设置 50 道面试题"),
});

export const studioInterviewResumePayloadSchema = z.object({
  fileName: z.string().trim().min(1),
  interviewQuestions: z.custom<ResumeAnalysisResult["interviewQuestions"]>(),
  resumeProfile: z.custom<ResumeAnalysisResult["resumeProfile"]>(),
});

/** @deprecated Use `PipelineStage` + `CandidateOutcome` instead. */
export type StudioInterviewStatus = z.infer<typeof studioInterviewStatusSchema>;
export type StudioInterviewScheduleEntryFormValue = z.infer<
  typeof studioInterviewScheduleEntrySchema
>;
export type StudioInterviewFormValues = z.infer<typeof studioInterviewFormSchema>;
export type StudioInterviewUpdateValues = z.infer<typeof studioInterviewUpdateSchema>;

/** @deprecated Use `pipelineStageMeta` + `candidateOutcomeMeta` instead. */
export const studioInterviewStatusMeta: Record<
  StudioInterviewStatus,
  { label: string; tone: "success" | "warning" | "info" | "outline" }
> = {
  archived: { label: "已归档", tone: "outline" },
  completed: { label: "已完成", tone: "success" },
  draft: { label: "草稿", tone: "outline" },
  in_progress: { label: "进行中", tone: "warning" },
  ready: { label: "待面试", tone: "info" },
};

export function createDefaultScheduleEntry(sortOrder = 0): StudioInterviewScheduleEntryFormValue {
  return {
    allowTextInput: false,
    notes: "",
    roundLabel: sortOrder === 0 ? "一面" : `第 ${sortOrder + 1} 轮`,
    scheduledAt: "",
    sortOrder,
  };
}

export function toNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function parseScheduleEntriesInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  return studioInterviewScheduleEntrySchema.array().parse(parsed);
}

export function parseResumePayloadInput(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = JSON.parse(value) as unknown;
  return studioInterviewResumePayloadSchema.parse(parsed);
}

export function getScheduleEntryDateValue(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return formatter.format(date).replace(" ", "T");
}
