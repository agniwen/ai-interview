import { candidateOutcomeMeta, pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import type {
  CandidateTimelineEventTone,
  ResumeEvaluationStatus,
} from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";

function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && Object.hasOwn(pipelineStageMeta, value);
}

function isCandidateOutcome(value: unknown): value is CandidateOutcome {
  return typeof value === "string" && Object.hasOwn(candidateOutcomeMeta, value);
}

export function stageLabel(value: unknown): string {
  return isPipelineStage(value) ? pipelineStageMeta[value].label : "未知阶段";
}

function outcomeLabel(value: unknown): string {
  return isCandidateOutcome(value) ? candidateOutcomeMeta[value].label : "进行中";
}

function isResumeEvaluationStatus(value: unknown): value is ResumeEvaluationStatus | null {
  return value === null || value === "pass" || value === "fail";
}

function resumeEvaluationLabel(value: unknown): string {
  return isResumeEvaluationStatus(value) ? describeResumeEvaluationStatus(value).label : "未知状态";
}

function jobDescriptionChangeLabel(
  detail: Record<string, unknown>,
  idKey: "fromJobDescriptionId" | "toJobDescriptionId",
  nameKey: "fromJobDescriptionName" | "toJobDescriptionName",
) {
  const name = typeof detail[nameKey] === "string" ? detail[nameKey].trim() : "";
  if (name) {
    return name;
  }
  const id = typeof detail[idKey] === "string" ? detail[idKey].trim() : "";
  return id || "未绑定岗位";
}

// oxlint-disable-next-line complexity -- Audit copy stays centralized by action.
export function auditDescription(detail: Record<string, unknown>, action: string): string | null {
  if (action === "candidate_transition") {
    const from = stageLabel(detail.fromStage);
    const to = stageLabel(detail.toStage);
    const outcome = outcomeLabel(detail.toOutcome);
    const reason =
      typeof detail.reactivationReason === "string" && detail.reactivationReason
        ? detail.reactivationReason
        : null;
    return reason
      ? `${from} -> ${to}，结论：${outcome}，原因：${reason}`
      : `${from} -> ${to}，结论：${outcome}`;
  }
  if (action === "round_reset") {
    const label = typeof detail.roundLabel === "string" ? detail.roundLabel : "AI 面试轮次";
    return `${label} 已重置为待开始`;
  }
  if (action === "ai_interview_launched") {
    const label = typeof detail.roundLabel === "string" ? detail.roundLabel : "AI 面试轮次";
    return `${label} 已发起`;
  }
  if (action === "agent_report_received") {
    const count = typeof detail.turnCount === "number" ? detail.turnCount : null;
    return count === null ? "AI 面试报告已同步" : `AI 面试报告已同步，共 ${count} 条转写`;
  }
  if (action === "resume_evaluation_submitted") {
    return `评估结果：${resumeEvaluationLabel(detail.toStatus)}`;
  }
  if (action === "resume_evaluation_updated") {
    return `评估状态：${resumeEvaluationLabel(detail.fromStatus)} -> ${resumeEvaluationLabel(detail.toStatus)}`;
  }
  if (action === "resume_evaluation_reset_for_job_change") {
    return typeof detail.reason === "string" ? detail.reason : "岗位变更后需重新评估";
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
    const count = typeof detail.questionCount === "number" ? detail.questionCount : null;
    return count === null ? "面试题草稿已生成" : `已生成 ${count} 道面试题草稿`;
  }
  if (action.startsWith("human_interview_round_")) {
    const label = typeof detail.roundLabel === "string" ? detail.roundLabel : "真人复面";
    if (action === "human_interview_round_created") {
      return `创建真人复面：${label}`;
    }
    if (action === "human_interview_round_updated") {
      return `更新真人复面：${label}`;
    }
    if (action === "human_interview_round_completed") {
      const outcome = typeof detail.outcome === "string" ? detail.outcome : null;
      return outcome ? `完成真人复面：${label}，结果：${outcome}` : `完成真人复面：${label}`;
    }
    if (action === "human_interview_round_cancelled") {
      const reason =
        typeof detail.reason === "string" && detail.reason ? `，原因：${detail.reason}` : "";
      return `取消真人复面：${label}${reason}`;
    }
  }
  if (action.startsWith("offer_draft_")) {
    const version = typeof detail.version === "number" ? ` v${detail.version}` : "";
    if (action === "offer_draft_created") {
      const position = typeof detail.position === "string" ? detail.position : "Offer";
      return `创建 Offer${version}：${position}`;
    }
    if (action === "offer_draft_updated") {
      return `更新 Offer${version}`;
    }
    if (action === "offer_draft_sent") {
      return `发送 Offer${version}`;
    }
    if (action === "offer_draft_responded") {
      const response = typeof detail.response === "string" ? detail.response : "已响应";
      return `记录候选人 Offer${version} 回复：${response}`;
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

export function auditTitle(action: string, detail: Record<string, unknown> = {}): string {
  const titles: Record<string, string> = {
    agent_report_received: "AI 报告已接收",
    ai_interview_launched: "发起 AI 面试",
    context_snapshot_refresh: "上下文已刷新",
    human_interview_round_cancelled: "真人复面取消",
    human_interview_round_completed: "真人复面完成",
    human_interview_round_created: "创建真人复面",
    human_interview_round_updated: "更新真人复面",
    interview_questions_drafted: "面试题草稿已生成",
    job_description_changed: "关联岗位已变更",
    offer_draft_cancelled: "Offer 已撤回",
    offer_draft_created: "创建 Offer",
    offer_draft_responded: "候选人回复 Offer",
    offer_draft_sent: "Offer 已发送",
    offer_draft_updated: "更新 Offer",
    resume_evaluation_reset_for_job_change: "简历评估已重置",
    resume_evaluation_submitted: "简历评估已提交",
    resume_evaluation_updated: "简历评估状态变更",
    round_reset: "AI 面试轮次重置",
  };
  if (action === "candidate_transition") {
    if (detail.toStage === "closed") {
      return "候选人结案";
    }
    if (detail.fromStage === "closed") {
      return "重新激活候选人";
    }
    return "候选人阶段流转";
  }
  return titles[action] ?? "系统操作";
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
