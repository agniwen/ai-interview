import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { serializeDate } from "../../../../../../lib/server/db/serialize";
import type { RecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import type { JsonObject } from "@arc/db-schema/json";
import type {
  CandidateTimelineEvent,
  CandidateTimelineEventMeta,
  CandidateTimelineEventTone,
  CandidateTimelineResponse,
} from "@arc/shared/studio-resumes";
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
import { loadResumeDetail } from "./resumes";
import { auditDescription, auditTitle, auditTone, stageLabel } from "./timeline-audit";
import { z } from "zod";

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

const CONVERSATION_RESULT_LABEL = {
  failed: "失败",
  partial: "部分完成",
  success: "成功",
} satisfies Record<string, string>;

const CONVERSATION_STATUS_LABEL = {
  completed: "已完成",
  connected: "进行中",
  connecting: "连接中",
  disconnected: "已断开",
  done: "已完成",
  failed: "失败",
  initiated: "已发起",
} satisfies Record<string, string>;

const HUMAN_INTERVIEW_ROUND_STATUS_LABEL = {
  cancelled: "已取消",
  completed: "已完成",
  pending: "待完成",
} satisfies Record<string, string>;

const NOTIFICATION_STATUS_LABEL = {
  failed: "发送失败",
  pending: "待发送",
  sent: "已发送",
} satisfies Record<string, string>;

const NOTIFICATION_TYPE_LABEL = {
  summary_ready: "报告完成通知",
} satisfies Record<string, string>;

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
    actorImage: input.actorImage,
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

function loadTimelineRows(interviewRecordId: string, organizationId: string) {
  return Promise.all([
    db
      .select({
        allowTextInput: studioInterviewSchedule.allowTextInput,
        candidateDeclineReason: studioInterviewSchedule.candidateDeclineReason,
        candidateInviteStatus: studioInterviewSchedule.candidateInviteStatus,
        candidateRespondedAt: studioInterviewSchedule.candidateRespondedAt,
        createdAt: studioInterviewSchedule.createdAt,
        creatorImage: user.image,
        creatorName: user.name,
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
      .leftJoin(user, eq(studioInterviewSchedule.createdBy, user.id))
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
        actorImage: user.image,
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

const nonEmptyStringSchema = z.string().min(1);

function auditDetailString(detail: JsonObject, key: string): string | null {
  return nonEmptyStringSchema.safeParse(detail[key]).data ?? null;
}

function buildOperatorAuditedActionKeys(
  auditLogs: { action: string; actorName: string | null; detail: JsonObject | null }[],
) {
  const keys = new Set<string>();
  for (const log of auditLogs) {
    if (!log.actorName) {
      continue;
    }
    const detail = log.detail ?? {};
    const entityId =
      auditDetailString(detail, "roundId") ??
      auditDetailString(detail, "draftId") ??
      auditDetailString(detail, "toStage");
    if (entityId) {
      keys.add(`${log.action}:${entityId}`);
    }
  }
  return keys;
}

function hasOperatorAuditedAction(
  keys: Set<string>,
  action: string,
  entityId: string | null | undefined,
) {
  return Boolean(entityId && keys.has(`${action}:${entityId}`));
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
  const operatorAuditedActionKeys = buildOperatorAuditedActionKeys(auditLogs);

  addEvent(events, {
    actorImage: candidate.creatorImage,
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

  if (
    candidate.closedAt &&
    !hasOperatorAuditedAction(operatorAuditedActionKeys, "candidate_transition", "closed")
  ) {
    addEvent(events, {
      actorImage: null,
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
      title: "候选人结束",
      tone: candidate.outcome === "hired" ? "success" : "muted",
    });
  }

  for (const round of aiRounds) {
    const statusMeta = scheduleEntryStatusMeta[round.status];
    addEvent(events, {
      actorImage: round.creatorImage,
      actorName: round.creatorName,
      description: `${round.roundLabel} 已创建，当前状态：${statusMeta.label}`,
      id: `ai-round:${round.id}:created`,
      kind: "ai_interview",
      metadata: compactMeta([
        textMeta("轮次", round.roundLabel),
        textMeta("状态", statusMeta.label),
        textMeta("文本作答", round.allowTextInput ? "允许" : "关闭"),
      ]),
      occurredAt: round.createdAt,
      title: "创建AI面试轮次",
      tone: "info",
    });
    addEvent(events, {
      actorImage: null,
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
      actorImage: null,
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
        actorImage: null,
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
        actorImage: null,
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
    if (round.candidateInviteStatus === "declined") {
      addEvent(events, {
        actorImage: null,
        actorName: "候选人",
        description: `${round.roundLabel}邀请`,
        id: `ai-round:${round.id}:candidate-declined`,
        kind: "ai_interview",
        metadata: compactMeta([
          textMeta("轮次", round.roundLabel),
          textMeta("拒绝原因", round.candidateDeclineReason),
        ]),
        occurredAt: round.candidateRespondedAt,
        title: "候选人已拒绝",
        tone: "warning",
      });
    }
  }

  for (const conversation of conversations) {
    addEvent(events, {
      actorImage: null,
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
      actorImage: null,
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
      actorImage: null,
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
    const hasCreatedAudit = hasOperatorAuditedAction(
      operatorAuditedActionKeys,
      "human_interview_round_created",
      round.id,
    );
    const hasUpdatedAudit = hasOperatorAuditedAction(
      operatorAuditedActionKeys,
      "human_interview_round_updated",
      round.id,
    );
    if (!hasCreatedAudit) {
      addEvent(events, {
        actorImage: null,
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
    }
    if (!(hasCreatedAudit || hasUpdatedAudit)) {
      addEvent(events, {
        actorImage: null,
        actorName: null,
        description: `${round.label} 已设置面试时间`,
        id: `human-round:${round.id}:scheduled`,
        kind: "human_interview",
        metadata: compactMeta([textMeta("轮次", round.label)]),
        occurredAt: round.scheduledAt,
        title: "真人复面已排期",
        tone: "info",
      });
    }
    if (
      round.completedAt &&
      !hasOperatorAuditedAction(
        operatorAuditedActionKeys,
        "human_interview_round_completed",
        round.id,
      )
    ) {
      addEvent(events, {
        actorImage: null,
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
    if (
      round.cancelledAt &&
      !hasOperatorAuditedAction(
        operatorAuditedActionKeys,
        "human_interview_round_cancelled",
        round.id,
      )
    ) {
      addEvent(events, {
        actorImage: null,
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
    const hasCreatedAudit = hasOperatorAuditedAction(
      operatorAuditedActionKeys,
      "offer_draft_created",
      draft.id,
    );
    if (!hasCreatedAudit) {
      addEvent(events, {
        actorImage: null,
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
    }
    if (
      !(
        hasCreatedAudit ||
        hasOperatorAuditedAction(operatorAuditedActionKeys, "offer_draft_sent", draft.id)
      )
    ) {
      addEvent(events, {
        actorImage: null,
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
    }
    if (!hasOperatorAuditedAction(operatorAuditedActionKeys, "offer_draft_responded", draft.id)) {
      addEvent(events, {
        actorImage: null,
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
  }

  for (const log of emailLogs) {
    addEvent(events, {
      actorImage: null,
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
      actorImage: null,
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
      actorImage: log.actorImage,
      actorName: log.actorName,
      description,
      id: `audit:${log.id}`,
      kind: "audit",
      metadata: compactMeta([
        textMeta("动作", auditTitle(log.action, log.detail ?? {})),
        textMeta("轮次 ID", log.scheduleEntryId),
        textMeta(
          "重新激活原因",
          log.action === "candidate_transition" && log.detail
            ? (nonEmptyStringSchema.safeParse(log.detail.reactivationReason).data ?? null)
            : null,
        ),
      ]),
      occurredAt: log.createdAt,
      title: auditTitle(log.action, log.detail ?? {}),
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
