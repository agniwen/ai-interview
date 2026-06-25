import { and, desc, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { serializeDate } from "@arc/ai-recruitment-copilot-backend/lib/server/db/serialize";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type {
  CandidateTimelineEvent,
  CandidateTimelineEventMeta,
  CandidateTimelineEventTone,
  CandidateTimelineResponse,
  ResumeEvaluationStatus,
} from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  interviewAuditLog,
  interviewConversation,
  interviewNotification,
  studioHumanInterviewRound,
  studioInterviewSchedule,
  studioOfferDraft,
  studioRoundEmailLog,
  user,
} from "@arc/db-schema/schema";
import {
  candidateOutcomeMeta,
  humanInterviewRoundOutcomeMeta,
  offerDraftStatusMeta,
  pipelineStageMeta,
  scheduleEntryStatusMeta,
} from "@arc/db-schema/studio-interviews";
import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import { loadResumeDetail } from "./resumes";

type TimeValue = Date | string | null | undefined;

function toIso(value: TimeValue): string | null {
  if (!value) {
    return null;
  }
  return serializeDate(value);
}

function textMeta(
  label: string,
  value: number | string | null | undefined,
): CandidateTimelineEventMeta | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return { label, value: String(value) };
}

function compactMeta(values: (CandidateTimelineEventMeta | null)[]): CandidateTimelineEventMeta[] {
  return values.filter((value): value is CandidateTimelineEventMeta => value !== null);
}

const CONVERSATION_RESULT_LABEL: Record<string, string> = {
  failed: "失败",
  success: "成功",
};

const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  completed: "已完成",
  connected: "进行中",
  connecting: "连接中",
  disconnected: "已断开",
  done: "已完成",
  failed: "失败",
  initiated: "已发起",
};

const HUMAN_INTERVIEW_ROUND_STATUS_LABEL: Record<string, string> = {
  cancelled: "已取消",
  completed: "已完成",
  pending: "待完成",
};

const NOTIFICATION_STATUS_LABEL: Record<string, string> = {
  failed: "发送失败",
  pending: "待发送",
  sent: "已发送",
};

const NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  summary_ready: "报告完成通知",
};

function translatedLabel(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) {
    return null;
  }
  return labels[value] ?? value;
}

function addEvent(
  events: CandidateTimelineEvent[],
  input: Omit<CandidateTimelineEvent, "metadata" | "occurredAt"> & {
    metadata?: CandidateTimelineEventMeta[];
    occurredAt: TimeValue;
  },
) {
  const occurredAt = toIso(input.occurredAt);
  if (!occurredAt) {
    return;
  }
  events.push({
    actorName: input.actorName,
    description: input.description,
    id: input.id,
    kind: input.kind,
    metadata: input.metadata ?? [],
    occurredAt,
    title: input.title,
    tone: input.tone,
  });
}

function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && Object.hasOwn(pipelineStageMeta, value);
}

function isCandidateOutcome(value: unknown): value is CandidateOutcome {
  return typeof value === "string" && Object.hasOwn(candidateOutcomeMeta, value);
}

function stageLabel(value: unknown): string {
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

function auditDescription(detail: Record<string, unknown>, action: string): string | null {
  if (action === "candidate_transition") {
    const from = stageLabel(detail.fromStage);
    const to = stageLabel(detail.toStage);
    const outcome = outcomeLabel(detail.toOutcome);
    return `${from} -> ${to}，结论：${outcome}`;
  }
  if (action === "round_reset") {
    const roundLabel = typeof detail.roundLabel === "string" ? detail.roundLabel : "AI 面试轮次";
    return `${roundLabel} 已重置为待开始`;
  }
  if (action === "agent_report_received") {
    const turnCount = typeof detail.turnCount === "number" ? detail.turnCount : null;
    return turnCount === null ? "AI 面试报告已同步" : `AI 面试报告已同步，共 ${turnCount} 条转写`;
  }
  if (action === "resume_evaluation_submitted") {
    return `评估结果：${resumeEvaluationLabel(detail.toStatus)}`;
  }
  if (action === "resume_evaluation_updated") {
    return `评估状态：${resumeEvaluationLabel(detail.fromStatus)} -> ${resumeEvaluationLabel(detail.toStatus)}`;
  }
  return null;
}

function auditTitle(action: string): string {
  switch (action) {
    case "candidate_transition": {
      return "候选人阶段流转";
    }
    case "round_reset": {
      return "AI 面试轮次重置";
    }
    case "agent_report_received": {
      return "AI 报告已接收";
    }
    case "resume_evaluation_submitted": {
      return "简历评估已提交";
    }
    case "resume_evaluation_updated": {
      return "简历评估状态变更";
    }
    default: {
      return "系统操作";
    }
  }
}

function auditTone(action: string): CandidateTimelineEventTone {
  if (action === "candidate_transition") {
    return "info";
  }
  if (action === "round_reset") {
    return "warning";
  }
  if (action === "agent_report_received") {
    return "success";
  }
  if (action === "resume_evaluation_submitted") {
    return "info";
  }
  if (action === "resume_evaluation_updated") {
    return "info";
  }
  return "muted";
}

function loadTimelineRows(interviewRecordId: string, organizationId: string) {
  return Promise.all([
    db
      .select({
        allowTextInput: studioInterviewSchedule.allowTextInput,
        createdAt: studioInterviewSchedule.createdAt,
        disconnectedAt: studioInterviewSchedule.disconnectedAt,
        id: studioInterviewSchedule.id,
        roundLabel: studioInterviewSchedule.roundLabel,
        scheduledAt: studioInterviewSchedule.scheduledAt,
        sessionStartedAt: studioInterviewSchedule.sessionStartedAt,
        sortOrder: studioInterviewSchedule.sortOrder,
        status: studioInterviewSchedule.status,
        updatedAt: studioInterviewSchedule.updatedAt,
      })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, interviewRecordId),
          eq(studioInterviewSchedule.organizationId, organizationId),
        ),
      ),
    db
      .select({
        callSuccessful: interviewConversation.callSuccessful,
        conversationId: interviewConversation.conversationId,
        createdAt: interviewConversation.createdAt,
        endedAt: interviewConversation.endedAt,
        lastSyncedAt: interviewConversation.lastSyncedAt,
        scheduleEntryId: interviewConversation.scheduleEntryId,
        startedAt: interviewConversation.startedAt,
        status: interviewConversation.status,
        transcriptSummary: interviewConversation.transcriptSummary,
        updatedAt: interviewConversation.updatedAt,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.interviewRecordId, interviewRecordId),
          eq(interviewConversation.organizationId, organizationId),
        ),
      ),
    db
      .select({
        cancelledAt: studioHumanInterviewRound.cancelledAt,
        completedAt: studioHumanInterviewRound.completedAt,
        createdAt: studioHumanInterviewRound.createdAt,
        id: studioHumanInterviewRound.id,
        label: studioHumanInterviewRound.label,
        outcome: studioHumanInterviewRound.outcome,
        scheduledAt: studioHumanInterviewRound.scheduledAt,
        score: studioHumanInterviewRound.score,
        sortOrder: studioHumanInterviewRound.sortOrder,
        status: studioHumanInterviewRound.status,
      })
      .from(studioHumanInterviewRound)
      .where(
        and(
          eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
          eq(studioHumanInterviewRound.organizationId, organizationId),
        ),
      ),
    db
      .select({
        createdAt: studioOfferDraft.createdAt,
        currency: studioOfferDraft.currency,
        id: studioOfferDraft.id,
        position: studioOfferDraft.position,
        responseAt: studioOfferDraft.responseAt,
        sentAt: studioOfferDraft.sentAt,
        status: studioOfferDraft.status,
        updatedAt: studioOfferDraft.updatedAt,
        version: studioOfferDraft.version,
      })
      .from(studioOfferDraft)
      .where(
        and(
          eq(studioOfferDraft.interviewRecordId, interviewRecordId),
          eq(studioOfferDraft.organizationId, organizationId),
        ),
      ),
    db
      .select({
        id: candidateFormSubmission.id,
        submittedAt: candidateFormSubmission.submittedAt,
        title: candidateFormTemplate.title,
      })
      .from(candidateFormSubmission)
      .leftJoin(
        candidateFormTemplate,
        eq(candidateFormSubmission.templateId, candidateFormTemplate.id),
      )
      .where(
        and(
          eq(candidateFormSubmission.interviewRecordId, interviewRecordId),
          eq(candidateFormSubmission.organizationId, organizationId),
        ),
      ),
    db
      .select({
        createdAt: studioRoundEmailLog.createdAt,
        errorMessage: studioRoundEmailLog.errorMessage,
        id: studioRoundEmailLog.id,
        roundId: studioRoundEmailLog.roundId,
        status: studioRoundEmailLog.status,
        subject: studioRoundEmailLog.subject,
        toEmail: studioRoundEmailLog.toEmail,
      })
      .from(studioRoundEmailLog)
      .where(
        and(
          eq(studioRoundEmailLog.interviewRecordId, interviewRecordId),
          eq(studioRoundEmailLog.organizationId, organizationId),
        ),
      ),
    db
      .select({
        createdAt: interviewNotification.createdAt,
        error: interviewNotification.error,
        id: interviewNotification.id,
        providerId: interviewNotification.providerId,
        sentAt: interviewNotification.sentAt,
        status: interviewNotification.status,
        type: interviewNotification.type,
        updatedAt: interviewNotification.updatedAt,
      })
      .from(interviewNotification)
      .where(
        and(
          eq(interviewNotification.interviewRecordId, interviewRecordId),
          eq(interviewNotification.organizationId, organizationId),
        ),
      ),
    db
      .select({
        action: interviewAuditLog.action,
        actorName: user.name,
        createdAt: interviewAuditLog.createdAt,
        detail: interviewAuditLog.detail,
        id: interviewAuditLog.id,
        scheduleEntryId: interviewAuditLog.scheduleEntryId,
      })
      .from(interviewAuditLog)
      .leftJoin(user, eq(interviewAuditLog.operatorId, user.id))
      .where(
        and(
          eq(interviewAuditLog.interviewRecordId, interviewRecordId),
          eq(interviewAuditLog.organizationId, organizationId),
        ),
      )
      .orderBy(desc(interviewAuditLog.createdAt)),
  ]);
}

function notificationTitle(status: string): string {
  if (status === "sent") {
    return "报告通知已发送";
  }
  if (status === "failed") {
    return "报告通知失败";
  }
  return "报告通知待发送";
}

function notificationTone(status: string): CandidateTimelineEventTone {
  if (status === "sent") {
    return "success";
  }
  if (status === "failed") {
    return "danger";
  }
  return "muted";
}

// oxlint-disable-next-line complexity -- Timeline composition touches each event source once so audit coverage stays explicit.
export async function loadCandidateTimeline(
  interviewRecordId: string,
  organizationId: string,
  visibilityScope?: RecruitingVisibilityScope,
): Promise<CandidateTimelineResponse | null> {
  const candidate = await loadResumeDetail(interviewRecordId, organizationId, visibilityScope);
  if (!candidate) {
    return null;
  }

  const [
    aiRounds,
    conversations,
    humanRounds,
    offerDrafts,
    formSubmissions,
    emailLogs,
    notifications,
    auditLogs,
  ] = await loadTimelineRows(interviewRecordId, organizationId);

  const events: CandidateTimelineEvent[] = [];

  addEvent(events, {
    actorName: candidate.creatorName,
    description:
      candidate.jobDescriptionName || candidate.targetRole
        ? `关联岗位：${candidate.jobDescriptionName ?? candidate.targetRole}`
        : "候选人档案已创建",
    id: `candidate:${candidate.id}:created`,
    kind: "candidate",
    metadata: compactMeta([
      textMeta("岗位", candidate.jobDescriptionName ?? candidate.targetRole),
      textMeta("创建人", candidate.creatorName),
    ]),
    occurredAt: candidate.createdAt,
    title: "候选人入库",
    tone: "default",
  });

  if (candidate.closedAt) {
    addEvent(events, {
      actorName: null,
      description: candidate.closedReason,
      id: `candidate:${candidate.id}:closed`,
      kind: "stage",
      metadata: compactMeta([
        textMeta("结论", candidateOutcomeMeta[candidate.outcome].label),
        textMeta(
          "前一阶段",
          candidate.closedMeta?.previousStage
            ? stageLabel(candidate.closedMeta.previousStage)
            : null,
        ),
      ]),
      occurredAt: candidate.closedAt,
      title: "候选人结案",
      tone: candidate.outcome === "hired" ? "success" : "muted",
    });
  }

  for (const round of aiRounds) {
    const statusMeta = scheduleEntryStatusMeta[round.status];
    addEvent(events, {
      actorName: null,
      description: `${round.roundLabel} 已创建，当前状态：${statusMeta.label}`,
      id: `ai-round:${round.id}:created`,
      kind: "ai_interview",
      metadata: compactMeta([
        textMeta("轮次", round.roundLabel),
        textMeta("状态", statusMeta.label),
        textMeta("文本作答", round.allowTextInput ? "允许" : "关闭"),
      ]),
      occurredAt: round.createdAt,
      title: "创建 AI 面试轮次",
      tone: "info",
    });
    addEvent(events, {
      actorName: null,
      description: `${round.roundLabel} 已设置候选人进场时间`,
      id: `ai-round:${round.id}:scheduled`,
      kind: "ai_interview",
      metadata: compactMeta([textMeta("轮次", round.roundLabel)]),
      occurredAt: round.scheduledAt,
      title: "AI 面试已排期",
      tone: "info",
    });
    addEvent(events, {
      actorName: null,
      description: `${round.roundLabel} 候选人已进入语音面试`,
      id: `ai-round:${round.id}:started`,
      kind: "ai_interview",
      metadata: compactMeta([textMeta("轮次", round.roundLabel)]),
      occurredAt: round.sessionStartedAt,
      title: "AI 面试开始",
      tone: "warning",
    });
    if (round.status === "completed") {
      addEvent(events, {
        actorName: null,
        description: `${round.roundLabel} 已结束`,
        id: `ai-round:${round.id}:completed`,
        kind: "ai_interview",
        metadata: compactMeta([textMeta("轮次", round.roundLabel)]),
        occurredAt: round.updatedAt,
        title: "AI 面试结束",
        tone: "success",
      });
    }
    if (round.status === "interrupted") {
      addEvent(events, {
        actorName: null,
        description: `${round.roundLabel} 出现断连或中断`,
        id: `ai-round:${round.id}:interrupted`,
        kind: "ai_interview",
        metadata: compactMeta([textMeta("轮次", round.roundLabel)]),
        occurredAt: round.disconnectedAt ?? round.updatedAt,
        title: "AI 面试中断",
        tone: "warning",
      });
    }
  }

  for (const conversation of conversations) {
    addEvent(events, {
      actorName: null,
      description: "候选人与 AI 面试官开始通话",
      id: `conversation:${conversation.conversationId}:started`,
      kind: "ai_interview",
      metadata: compactMeta([
        textMeta("会话", conversation.conversationId),
        textMeta("轮次 ID", conversation.scheduleEntryId),
      ]),
      occurredAt: conversation.startedAt ?? conversation.createdAt,
      title: "AI 通话开始",
      tone: "warning",
    });
    addEvent(events, {
      actorName: null,
      description: conversation.transcriptSummary ?? "AI 面试通话与报告已同步",
      id: `conversation:${conversation.conversationId}:synced`,
      kind: "ai_interview",
      metadata: compactMeta([
        textMeta("会话", conversation.conversationId),
        textMeta("结果", translatedLabel(conversation.callSuccessful, CONVERSATION_RESULT_LABEL)),
        textMeta("状态", translatedLabel(conversation.status, CONVERSATION_STATUS_LABEL)),
      ]),
      occurredAt: conversation.lastSyncedAt ?? conversation.endedAt ?? conversation.updatedAt,
      title: "AI 报告同步",
      tone: "success",
    });
  }

  for (const submission of formSubmissions) {
    addEvent(events, {
      actorName: null,
      description: submission.title ? `表单：${submission.title}` : "候选人提交了面试前表单",
      id: `form:${submission.id}`,
      kind: "form",
      metadata: compactMeta([textMeta("表单", submission.title)]),
      occurredAt: submission.submittedAt,
      title: "候选人提交表单",
      tone: "info",
    });
  }

  for (const round of humanRounds) {
    addEvent(events, {
      actorName: null,
      description: `${round.label} 已创建`,
      id: `human-round:${round.id}:created`,
      kind: "human_interview",
      metadata: compactMeta([
        textMeta("轮次", round.label),
        textMeta("状态", translatedLabel(round.status, HUMAN_INTERVIEW_ROUND_STATUS_LABEL)),
      ]),
      occurredAt: round.createdAt,
      title: "创建真人复面",
      tone: "info",
    });
    addEvent(events, {
      actorName: null,
      description: `${round.label} 已设置面试时间`,
      id: `human-round:${round.id}:scheduled`,
      kind: "human_interview",
      metadata: compactMeta([textMeta("轮次", round.label)]),
      occurredAt: round.scheduledAt,
      title: "真人复面已排期",
      tone: "info",
    });
    if (round.completedAt) {
      addEvent(events, {
        actorName: null,
        description: round.outcome
          ? `${round.label} 完成，结果：${humanInterviewRoundOutcomeMeta[round.outcome].label}`
          : `${round.label} 完成`,
        id: `human-round:${round.id}:completed`,
        kind: "human_interview",
        metadata: compactMeta([
          textMeta("轮次", round.label),
          textMeta(
            "结果",
            round.outcome ? humanInterviewRoundOutcomeMeta[round.outcome].label : null,
          ),
          textMeta("评分", round.score),
        ]),
        occurredAt: round.completedAt,
        title: "真人复面完成",
        tone: round.outcome === "pass" ? "success" : "muted",
      });
    }
    if (round.cancelledAt) {
      addEvent(events, {
        actorName: null,
        description: `${round.label} 已取消`,
        id: `human-round:${round.id}:cancelled`,
        kind: "human_interview",
        metadata: compactMeta([textMeta("轮次", round.label)]),
        occurredAt: round.cancelledAt,
        title: "真人复面取消",
        tone: "muted",
      });
    }
  }

  for (const draft of offerDrafts) {
    const statusMeta = offerDraftStatusMeta[draft.status];
    addEvent(events, {
      actorName: null,
      description: `${draft.position} Offer v${draft.version} 已创建`,
      id: `offer:${draft.id}:created`,
      kind: "offer",
      metadata: compactMeta([
        textMeta("职位", draft.position),
        textMeta("版本", `v${draft.version}`),
        textMeta("币种", draft.currency),
      ]),
      occurredAt: draft.createdAt,
      title: "创建 Offer",
      tone: "info",
    });
    addEvent(events, {
      actorName: null,
      description: `Offer v${draft.version} 已发送，当前状态：${statusMeta.label}`,
      id: `offer:${draft.id}:sent`,
      kind: "offer",
      metadata: compactMeta([
        textMeta("职位", draft.position),
        textMeta("版本", `v${draft.version}`),
        textMeta("状态", statusMeta.label),
      ]),
      occurredAt: draft.sentAt,
      title: "Offer 已发送",
      tone: "info",
    });
    addEvent(events, {
      actorName: null,
      description: `候选人对 Offer v${draft.version} 的反馈：${statusMeta.label}`,
      id: `offer:${draft.id}:response`,
      kind: "offer",
      metadata: compactMeta([
        textMeta("职位", draft.position),
        textMeta("版本", `v${draft.version}`),
        textMeta("状态", statusMeta.label),
      ]),
      occurredAt: draft.responseAt,
      title: "候选人回复 Offer",
      tone: draft.status === "accepted" ? "success" : "warning",
    });
  }

  for (const log of emailLogs) {
    addEvent(events, {
      actorName: null,
      description: log.status === "sent" ? log.subject : (log.errorMessage ?? "邮件发送失败"),
      id: `email:${log.id}`,
      kind: "email",
      metadata: compactMeta([
        textMeta("收件人", log.toEmail),
        textMeta("状态", log.status === "sent" ? "已发送" : "失败"),
        textMeta("轮次 ID", log.roundId),
      ]),
      occurredAt: log.createdAt,
      title: log.status === "sent" ? "面试邀约邮件已发送" : "面试邀约邮件发送失败",
      tone: log.status === "sent" ? "success" : "danger",
    });
  }

  for (const notification of notifications) {
    addEvent(events, {
      actorName: null,
      description: notification.error ?? "AI 面试报告通知状态更新",
      id: `notification:${notification.id}`,
      kind: "notification",
      metadata: compactMeta([
        textMeta("渠道", notification.providerId),
        textMeta("类型", translatedLabel(notification.type, NOTIFICATION_TYPE_LABEL)),
        textMeta("状态", translatedLabel(notification.status, NOTIFICATION_STATUS_LABEL)),
      ]),
      occurredAt: notification.sentAt ?? notification.updatedAt ?? notification.createdAt,
      title: notificationTitle(notification.status),
      tone: notificationTone(notification.status),
    });
  }

  for (const log of auditLogs) {
    const description = auditDescription(log.detail ?? {}, log.action);
    if (!description) {
      continue;
    }
    addEvent(events, {
      actorName: log.actorName,
      description,
      id: `audit:${log.id}`,
      kind: "audit",
      metadata: compactMeta([
        textMeta("动作", auditTitle(log.action)),
        textMeta("轮次 ID", log.scheduleEntryId),
      ]),
      occurredAt: log.createdAt,
      title: auditTitle(log.action),
      tone: auditTone(log.action),
    });
  }

  events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  return {
    events: events.slice(0, 120),
    summary: {
      currentOutcomeLabel: candidateOutcomeMeta[candidate.outcome].label,
      currentStageLabel: pipelineStageMeta[candidate.pipelineStage].label,
      latestAt: events[0]?.occurredAt ?? null,
      totalEvents: events.length,
    },
  };
}
