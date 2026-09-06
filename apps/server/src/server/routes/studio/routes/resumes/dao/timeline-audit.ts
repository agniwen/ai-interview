import { z } from "zod";
import {
  candidateOutcomeMeta,
  candidateOutcomeSchema,
  pipelineStageMeta,
  pipelineStageSchema,
  resumeEvaluationStatusSchema,
  recruitingNodeStatusSchema,
  recruitingNodeStatusMeta,
  recruitingNodeResultSchema,
  recruitingNodeResultMeta,
} from "@app/db-schema/studio-interviews";
import type { CandidateTimelineEventTone } from "@app/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@app/shared/studio-resumes";

const optionalAuditStringSchema = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const optionalAuditNumberSchema = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);

const auditDetailSchema = z
  .object({
    fromJobDescriptionId: optionalAuditStringSchema,
    fromJobDescriptionName: optionalAuditStringSchema,
    fromStage: optionalAuditStringSchema,
    fromStatus: optionalAuditStringSchema,
    node: optionalAuditStringSchema,
    outcome: optionalAuditStringSchema,
    position: optionalAuditStringSchema,
    questionCount: optionalAuditNumberSchema,
    reactivationReason: optionalAuditStringSchema,
    reason: optionalAuditStringSchema,
    reasonCode: optionalAuditStringSchema,
    response: optionalAuditStringSchema,
    result: optionalAuditStringSchema,
    roundLabel: optionalAuditStringSchema,
    skippedNodes: z.array(z.string()).nullish(),
    status: optionalAuditStringSchema,
    toJobDescriptionId: optionalAuditStringSchema,
    toJobDescriptionName: optionalAuditStringSchema,
    toOutcome: optionalAuditStringSchema,
    toStage: optionalAuditStringSchema,
    toStatus: optionalAuditStringSchema,
    turnCount: optionalAuditNumberSchema,
    version: optionalAuditNumberSchema,
  })
  .passthrough();

type AuditDetail = z.output<typeof auditDetailSchema>;

const AUDIT_TITLES = new Map([
  ["recruiting_evaluation_invalidated", "历史简历分析已失效"],
  ["recruiting_node_advanced", "招聘阶段推进"],
  ["recruiting_node_updated", "招聘节点更新"],
  ["recruiting_reopened", "招聘流程回退／重新激活"],
  ["recruiting_closed", "招聘流程已结束"],
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
  if (value === "human_interview") {
    return "真人面试";
  }
  if (value === "written_test") {
    return "笔试";
  }
  const result = pipelineStageSchema.safeParse(value);
  return result.success ? pipelineStageMeta[result.data].label : "未知阶段";
}

function outcomeLabel(value: string | undefined): string {
  if (value === "hired") {
    return "已入职";
  }
  const result = candidateOutcomeSchema.safeParse(value);
  return result.success ? candidateOutcomeMeta[result.data].label : "进行中";
}

function resumeEvaluationLabel(value: string | null | undefined): string {
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

const CLOSE_REASON_LABELS = new Map([
  ["background_check_failed", "背调异常"],
  ["candidate_withdrew", "候选人放弃"],
  ["interview_failed", "面试淘汰"],
  ["offer_declined", "候选人拒绝 Offer"],
  ["onboarded", "已入职"],
  ["onboarding_no_show", "候选人爽约"],
  ["other", "其他原因"],
  ["position_closed", "岗位关闭"],
  ["resume_rejected", "简历淘汰"],
  ["salary_disagreement", "谈薪失败"],
]);
function decisionLabel(value: string): string {
  const parsed = recruitingNodeResultSchema.safeParse(value);
  return parsed.success ? recruitingNodeResultMeta[parsed.data].label : "待确认";
}
function offerResponseLabel(value: string | undefined): string {
  if (value === "accepted") {
    return "已接受";
  }
  if (value === "declined") {
    return "已拒绝";
  }
  if (value === "counter") {
    return "继续谈薪";
  }
  return "已响应";
}
function pipelineDescription(detail: AuditDetail, action: string): string | null {
  const reason = detail.reason ? `，原因：${detail.reason}` : "";
  if (action === "recruiting_evaluation_invalidated") {
    return "关联岗位变更，历史简历分析已失效，等待重新评估";
  }
  if (action === "recruiting_node_advanced") {
    const skipped = detail.skippedNodes?.length
      ? `，跳过：${detail.skippedNodes.map(stageLabel).join("、")}`
      : "";
    return `${stageLabel(detail.fromStage)} → ${stageLabel(detail.toStage)}${skipped}${reason}`;
  }
  if (action === "recruiting_reopened") {
    return `${stageLabel(detail.fromStage)} → ${stageLabel(detail.toStage)}，恢复为待处理${reason}`;
  }
  if (action === "recruiting_closed") {
    const closeReason = detail.reasonCode ? CLOSE_REASON_LABELS.get(detail.reasonCode) : undefined;
    return `${stageLabel(detail.fromStage)} → 已结束，结论：${outcomeLabel(detail.toOutcome)}${closeReason && closeReason !== outcomeLabel(detail.toOutcome) ? `（${closeReason}）` : ""}${reason}`;
  }
  if (action === "recruiting_node_updated") {
    const status = recruitingNodeStatusSchema.safeParse(detail.status);
    let label = status.success ? recruitingNodeStatusMeta[status.data].label : "状态已更新";
    if (detail.result) {
      label = decisionLabel(detail.result);
    }
    return `${stageLabel(detail.node ?? detail.toStage)}：${label}${reason}`;
  }
  return null;
}

// oxlint-disable-next-line complexity -- Audit copy stays centralized by action.
export function auditDescription(
  detailInput: z.input<typeof auditDetailSchema>,
  action: string,
): string | null {
  const detail = auditDetailSchema.parse(detailInput);
  const pipeline = pipelineDescription(detail, action);
  if (pipeline) {
    return pipeline;
  }
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
        ? `完成真人复面：${label}，结果：${decisionLabel(detail.outcome)}`
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
      return `记录候选人 Offer${version} 回复：${offerResponseLabel(detail.response)}`;
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
      return "候选人结束";
    }
    if (detail.fromStage === "closed") {
      return "重新激活候选人";
    }
    return "候选人阶段流转";
  }
  return AUDIT_TITLES.get(action) ?? "系统操作";
}

function resultTone(
  value: string | undefined,
  fallback: CandidateTimelineEventTone,
): CandidateTimelineEventTone {
  if (["hired", "pass", "accepted"].includes(value ?? "")) {
    return "success";
  }
  if (["rejected", "fail", "declined"].includes(value ?? "")) {
    return "danger";
  }
  return fallback;
}

export function auditTone(
  action: string,
  detailInput: z.input<typeof auditDetailSchema> = {},
): CandidateTimelineEventTone {
  const detail = auditDetailSchema.parse(detailInput);
  if (action === "recruiting_closed") {
    return resultTone(detail.toOutcome, "warning");
  }
  if (action === "recruiting_node_updated") {
    return resultTone(detail.result, "info");
  }
  if (action === "human_interview_round_completed") {
    return resultTone(detail.outcome, "success");
  }
  if (action === "offer_draft_responded") {
    return resultTone(detail.response, "info");
  }
  if (["agent_report_received", "interview_questions_drafted"].includes(action)) {
    return "success";
  }
  if (
    [
      "recruiting_reopened",
      "recruiting_evaluation_invalidated",
      "round_reset",
      "resume_evaluation_reset_for_job_change",
      "offer_draft_cancelled",
    ].includes(action)
  ) {
    return "warning";
  }
  if (action === "human_interview_round_cancelled") {
    return "muted";
  }
  return AUDIT_TITLES.has(action) || action === "candidate_transition" ? "info" : "muted";
}
