import { z } from "zod";
import {
  candidateOutcomeMeta,
  candidateOutcomeSchema,
  pipelineStageMeta,
  pipelineStageSchema,
  resumeEvaluationStatusSchema,
} from "@arc/db-schema/studio-interviews";
import type { CandidateTimelineEventTone } from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";

const auditDetailSchema = z
  .object({
    fromJobDescriptionId: z.string().optional(),
    fromJobDescriptionName: z.string().optional(),
    fromStage: z.string().optional(),
    fromStatus: resumeEvaluationStatusSchema.nullable().optional(),
    outcome: z.string().optional(),
    position: z.string().optional(),
    questionCount: z.number().optional(),
    reactivationReason: z.string().optional(),
    reason: z.string().optional(),
    response: z.string().optional(),
    roundLabel: z.string().optional(),
    toJobDescriptionId: z.string().optional(),
    toJobDescriptionName: z.string().optional(),
    toOutcome: z.string().optional(),
    toStage: z.string().optional(),
    toStatus: resumeEvaluationStatusSchema.nullable().optional(),
    turnCount: z.number().optional(),
    version: z.number().optional(),
  })
  .passthrough();

type AuditDetail = z.output<typeof auditDetailSchema>;

const AUDIT_TITLES = new Map([
  ["agent_report_received", "AI 报告已接收"],
  ["ai_interview_launched", "发起 AI 面试"],
  ["context_snapshot_refresh", "上下文已刷新"],
  ["human_interview_round_cancelled", "真人复面取消"],
  ["human_interview_round_completed", "真人复面完成"],
  ["human_interview_round_created", "创建真人复面"],
  ["human_interview_round_updated", "更新真人复面"],
  ["interview_questions_drafted", "面试题草稿已生成"],
  ["job_description_changed", "关联岗位已变更"],
  ["offer_draft_cancelled", "Offer 已撤回"],
  ["offer_draft_created", "创建 Offer"],
  ["offer_draft_responded", "候选人回复 Offer"],
  ["offer_draft_sent", "Offer 已发送"],
  ["offer_draft_updated", "更新 Offer"],
  ["resume_evaluation_reset_for_job_change", "简历评估已重置"],
  ["resume_evaluation_submitted", "简历评估已提交"],
  ["resume_evaluation_updated", "简历评估状态变更"],
  ["round_reset", "AI 面试轮次重置"],
]);

export function stageLabel(value: string | undefined): string {
  const result = pipelineStageSchema.safeParse(value);
  return result.success ? pipelineStageMeta[result.data].label : "未知阶段";
}

function outcomeLabel(value: string | undefined): string {
  const result = candidateOutcomeSchema.safeParse(value);
  return result.success ? candidateOutcomeMeta[result.data].label : "进行中";
}

function resumeEvaluationLabel(
  value: z.input<typeof resumeEvaluationStatusSchema> | null | undefined,
): string {
  const result = resumeEvaluationStatusSchema.nullable().safeParse(value);
  return result.success ? describeResumeEvaluationStatus(result.data).label : "未知状态";
}

function jobDescriptionChangeLabel(
  detail: AuditDetail,
  idKey: "fromJobDescriptionId" | "toJobDescriptionId",
  nameKey: "fromJobDescriptionName" | "toJobDescriptionName",
) {
  return detail[nameKey]?.trim() || detail[idKey]?.trim() || "未绑定岗位";
}

// oxlint-disable-next-line complexity -- Audit copy stays centralized by action.
export function auditDescription(
  detailInput: z.input<typeof auditDetailSchema>,
  action: string,
): string | null {
  const detail = auditDetailSchema.parse(detailInput);
  if (action === "candidate_transition") {
    const from = stageLabel(detail.fromStage);
    const to = stageLabel(detail.toStage);
    const outcome = outcomeLabel(detail.toOutcome);
    const reason = detail.reactivationReason || null;
    return reason
      ? `${from} -> ${to}，结论：${outcome}，原因：${reason}`
      : `${from} -> ${to}，结论：${outcome}`;
  }
  if (action === "round_reset") {
    return `${detail.roundLabel ?? "AI 面试轮次"} 已重置为待开始`;
  }
  if (action === "ai_interview_launched") {
    return `${detail.roundLabel ?? "AI 面试轮次"} 已发起`;
  }
  if (action === "agent_report_received") {
    return detail.turnCount === undefined
      ? "AI 面试报告已同步"
      : `AI 面试报告已同步，共 ${detail.turnCount} 条转写`;
  }
  if (action === "resume_evaluation_submitted") {
    return `评估结果：${resumeEvaluationLabel(detail.toStatus)}`;
  }
  if (action === "resume_evaluation_updated") {
    return `评估状态：${resumeEvaluationLabel(detail.fromStatus)} -> ${resumeEvaluationLabel(detail.toStatus)}`;
  }
  if (action === "resume_evaluation_reset_for_job_change") {
    return detail.reason ?? "岗位变更后需重新评估";
  }
  if (action === "job_description_changed") {
    const from = jobDescriptionChangeLabel(
      detail,
      "fromJobDescriptionId",
      "fromJobDescriptionName",
    );
    const to = jobDescriptionChangeLabel(detail, "toJobDescriptionId", "toJobDescriptionName");
    return `${from} -> ${to}`;
  }
  if (action === "interview_questions_drafted") {
    return detail.questionCount === undefined
      ? "面试题草稿已生成"
      : `已生成 ${detail.questionCount} 道面试题草稿`;
  }
  if (action.startsWith("human_interview_round_")) {
    const label = detail.roundLabel ?? "真人复面";
    if (action === "human_interview_round_created") {
      return `创建真人复面：${label}`;
    }
    if (action === "human_interview_round_updated") {
      return `更新真人复面：${label}`;
    }
    if (action === "human_interview_round_completed") {
      return detail.outcome
        ? `完成真人复面：${label}，结果：${detail.outcome}`
        : `完成真人复面：${label}`;
    }
    if (action === "human_interview_round_cancelled") {
      const reason = detail.reason ? `，原因：${detail.reason}` : "";
      return `取消真人复面：${label}${reason}`;
    }
  }
  if (action.startsWith("offer_draft_")) {
    const version = detail.version === undefined ? "" : ` v${detail.version}`;
    if (action === "offer_draft_created") {
      return `创建 Offer${version}：${detail.position ?? "Offer"}`;
    }
    if (action === "offer_draft_updated") {
      return `更新 Offer${version}`;
    }
    if (action === "offer_draft_sent") {
      return `发送 Offer${version}`;
    }
    if (action === "offer_draft_responded") {
      return `记录候选人 Offer${version} 回复：${detail.response ?? "已响应"}`;
    }
    if (action === "offer_draft_cancelled") {
      return `撤回 Offer${version}`;
    }
  }
  if (action === "context_snapshot_refresh") {
    return "刷新 AI 面试上下文";
  }
  return null;
}

export function auditTitle(
  action: string,
  detailInput: z.input<typeof auditDetailSchema> = {},
): string {
  const detail = auditDetailSchema.parse(detailInput);
  if (action === "candidate_transition") {
    if (detail.toStage === "closed") {
      return "候选人结案";
    }
    if (detail.fromStage === "closed") {
      return "重新激活候选人";
    }
    return "候选人阶段流转";
  }
  return AUDIT_TITLES.get(action) ?? "系统操作";
}

export function auditTone(action: string): CandidateTimelineEventTone {
  if (
    action === "agent_report_received" ||
    action === "interview_questions_drafted" ||
    action === "human_interview_round_completed"
  ) {
    return "success";
  }
  if (
    action === "round_reset" ||
    action === "resume_evaluation_reset_for_job_change" ||
    action === "offer_draft_cancelled"
  ) {
    return "warning";
  }
  if (action === "human_interview_round_cancelled") {
    return "muted";
  }
  if (
    action === "candidate_transition" ||
    action === "ai_interview_launched" ||
    action === "resume_evaluation_submitted" ||
    action === "resume_evaluation_updated" ||
    action === "job_description_changed" ||
    action.startsWith("human_interview_round_") ||
    action.startsWith("offer_draft_") ||
    action === "context_snapshot_refresh"
  ) {
    return "info";
  }
  return "muted";
}
