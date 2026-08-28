/* oxlint-disable max-lines -- Notification event builders share one audited transactional boundary. */
import type { Transaction } from "../dao";
import { enqueueInterviewNotificationEvent } from "../dao";
import { prepareInterviewNotificationDeliveries } from "./prepare-deliveries";
import {
  interviewConversation,
  globalConfig,
  interviewNotification,
  interviewNotificationEvent,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type {
  AiInvitationExceptionType,
  InterviewNotificationEventType,
} from "@arc/db-schema/interview-notifications";
import { buildInterviewLink } from "@arc/shared/interview/interview-record";
import { buildInterviewNotificationDedupeKey } from "@arc/shared/interview-notifications";
import {
  hasExistingInterviewAnswers,
  isInterviewQuestionSetComplete,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import { and, asc, desc, eq, inArray, lt, lte } from "drizzle-orm";
import {
  buildCandidateInviteToken,
  hashInviteToken,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meeting-access";
import {
  buildAiInterviewInvitationToken,
  hashAiInterviewInvitationToken,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/ai-interview-invitation-access";

const REMINDER_OFFSETS_MINUTES = [24 * 60, 60] as const;

export const AI_INTERVIEW_COMPLETION_NOTICES = {
  complete: (candidateName: string) => `${candidateName} 已完成 AI 面试，报告生成后将另行通知。`,
  partial:
    "候选人已结束 AI 面试，但部分问题未完成，系统未自动生成候选人评价表。可前往 AI 面试列表，根据已有回答生成。",
  unavailable:
    "候选人已结束 AI 面试，但未产生有效回答，无法生成候选人评价表。可前往 AI 面试列表查看面试记录。",
} as const;

export function resolveAiInterviewCompletionNotice(
  dataCollectionResults: InterviewDataCollectionResults | null,
  candidateName = "候选人",
): string {
  if (isInterviewQuestionSetComplete(dataCollectionResults)) {
    return AI_INTERVIEW_COMPLETION_NOTICES.complete(candidateName);
  }
  return hasExistingInterviewAnswers(dataCollectionResults)
    ? AI_INTERVIEW_COMPLETION_NOTICES.partial
    : AI_INTERVIEW_COMPLETION_NOTICES.unavailable;
}

export function resolveInterviewNotificationCompanyName(
  configuredCompanyName: string | null | undefined,
  workspaceName: string,
): string {
  return configuredCompanyName?.trim() || workspaceName;
}

async function enqueuePreparedInterviewNotificationEvent(
  tx: Transaction,
  input: Parameters<typeof enqueueInterviewNotificationEvent>[1],
) {
  const event = await enqueueInterviewNotificationEvent(tx, input);
  // Keeping both writes on this transaction freezes template, recipient, and
  // rendered content at the business-event boundary.
  await prepareInterviewNotificationDeliveries(event, tx);
  return event;
}

function absoluteAppUrl(path: string): string | undefined {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : undefined;
}

function reportUrl(roundId: string, organizationSlug: string): string | undefined {
  return absoluteAppUrl(
    `/w/${encodeURIComponent(organizationSlug)}/studio/interviews?roundId=${encodeURIComponent(roundId)}`,
  );
}

function humanInterviewRecordUrl(
  interviewRecordId: string,
  organizationSlug: string,
): string | undefined {
  return absoluteAppUrl(
    `/w/${encodeURIComponent(organizationSlug)}/studio/resumes/${encodeURIComponent(interviewRecordId)}`,
  );
}

const HR_INITIAL_EVALUATION_LINES = [
  "・求职动机：未收集到",
  "・最快到岗时间：未收集到",
  "・出差接受情况：未收集到",
  "・薪酬预期：未收集到",
  "・现有薪资与加薪诉求：未收集到",
  "・近期两段工作经历概况：未收集到",
  "・核心亮点项目：未收集到",
] as const;

const HUMAN_EVALUATION_LINES = [
  "・综合评级：未收集到",
  "・建议职级定位：未收集到",
  "・岗位角色适配定位：未收集到",
  "・专业技能评估：未收集到",
  "・候选人优势特点：未收集到",
  "・潜在劣势与风险点：未收集到",
  "・建议薪资区间：未收集到",
  "・面试官原始评语：未收集到",
] as const;

export function buildHumanInterviewEvaluationSummary(
  rounds: { interviewerNames: string[]; label: string; roundNumber: number }[],
): string {
  const sections = [`🗂️ 第 1 轮 AI HR 初面评价\n${HR_INITIAL_EVALUATION_LINES.join("\n")}`];
  for (const round of rounds) {
    sections.push(
      `🗂️ 第 ${round.roundNumber} 轮 ${round.label}评价\n・面试官：${round.interviewerNames.join("、") || "未收集到"}\n${HUMAN_EVALUATION_LINES.join("\n")}`,
    );
  }
  return sections.join("\n\n");
}

export function buildInterviewReminderSchedule(
  scheduledAt: Date | null,
  now: Date = new Date(),
): { availableAt: Date; offsetMinutes: number }[] {
  if (!scheduledAt) {
    return [];
  }
  return REMINDER_OFFSETS_MINUTES.flatMap((offsetMinutes) => {
    const availableAt = new Date(scheduledAt.getTime() - offsetMinutes * 60_000);
    return availableAt.getTime() > now.getTime() ? [{ availableAt, offsetMinutes }] : [];
  });
}

interface HumanInterviewRoundProgression {
  currentRoundNumber: number;
  previousRoundName: string;
  previousRoundNumber: number;
}

export function buildHumanInterviewRoundProgression(
  passedHumanRounds: { label: string }[],
): HumanInterviewRoundProgression {
  const currentRoundNumber = passedHumanRounds.length + 2;
  return {
    currentRoundNumber,
    previousRoundName: passedHumanRounds.at(-1)?.label ?? "HR 初面",
    previousRoundNumber: currentRoundNumber - 1,
  };
}

async function loadHumanInterviewRoundProgression(
  tx: Transaction,
  input: { currentSortOrder: number; interviewRecordId: string },
) {
  const passedHumanRounds = await tx
    .select({ label: studioHumanInterviewRound.label })
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.interviewRecordId, input.interviewRecordId),
        lt(studioHumanInterviewRound.sortOrder, input.currentSortOrder),
        eq(studioHumanInterviewRound.status, "completed"),
        eq(studioHumanInterviewRound.outcome, "pass"),
      ),
    )
    .orderBy(asc(studioHumanInterviewRound.sortOrder));
  return buildHumanInterviewRoundProgression(passedHumanRounds);
}

export async function enqueueAiInterviewInvitedEvents(
  tx: Transaction,
  input: { actorUserId: string | null; scheduleEntryId: string; now?: Date },
): Promise<void> {
  const [context] = await tx
    .select({
      candidateInviteExpiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
      candidateInviteTokenHash: studioInterviewSchedule.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      initiatorEmail: user.email,
      initiatorName: user.name,
      interviewRecordId: studioInterview.id,
      invitationVersion: studioInterviewSchedule.invitationVersion,
      jobName: studioInterview.targetRole,
      organizationId: studioInterview.organizationId,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduleCreatedAt: studioInterviewSchedule.createdAt,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      scheduledEndAt: studioInterviewSchedule.scheduledEndAt,
      workspaceName: organization.name,
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
    .where(eq(studioInterviewSchedule.id, input.scheduleEntryId))
    .limit(1);
  if (!context) {
    throw new Error("AI 面试邀请通知事件缺少轮次上下文。");
  }

  const now = input.now ?? new Date();
  let candidateInvitationLink: string | undefined;
  if (context.candidateInviteExpiresAt) {
    const token = buildAiInterviewInvitationToken({
      exp: context.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: input.scheduleEntryId,
    });
    if (hashAiInterviewInvitationToken(token) === context.candidateInviteTokenHash) {
      candidateInvitationLink = absoluteAppUrl(`/ai-interview-invite/${encodeURIComponent(token)}`);
    }
  }
  const payloadSnapshot = {
    candidateName: context.candidateName,
    companyName: resolveInterviewNotificationCompanyName(
      context.configuredCompanyName,
      context.workspaceName,
    ),
    initiatorName: context.initiatorName ?? undefined,
    interviewEndTime: context.scheduledEndAt?.toISOString(),
    interviewLink:
      candidateInvitationLink ??
      absoluteAppUrl(buildInterviewLink(context.interviewRecordId, input.scheduleEntryId)),
    interviewStartTime: context.scheduledAt?.toISOString(),
    interviewType: "ai" as const,
    invitationEndTime:
      context.candidateInviteExpiresAt?.toISOString() ?? context.scheduledEndAt?.toISOString(),
    invitationStartTime: context.scheduleCreatedAt.toISOString(),
    jobName: context.jobName ?? undefined,
    roundName: context.roundLabel,
    schemaVersion: 1 as const,
    supportContact: context.initiatorEmail ?? undefined,
    timeZone: "Asia/Shanghai",
  };
  await enqueuePreparedInterviewNotificationEvent(tx, {
    actorUserId: input.actorUserId,
    dedupeKey: buildInterviewNotificationDedupeKey({
      scopeId: input.scheduleEntryId,
      type: "ai_interview_invited",
      version: context.invitationVersion,
    }),
    interviewRecordId: context.interviewRecordId,
    organizationId: context.organizationId,
    payloadSnapshot,
    scheduleEntryId: input.scheduleEntryId,
    scopeType: "ai_round",
    type: "ai_interview_invited",
  });

  for (const reminder of buildInterviewReminderSchedule(context.scheduledAt, now)) {
    await enqueuePreparedInterviewNotificationEvent(tx, {
      actorUserId: input.actorUserId,
      availableAt: reminder.availableAt,
      dedupeKey: buildInterviewNotificationDedupeKey({
        discriminator: reminder.offsetMinutes,
        scopeId: input.scheduleEntryId,
        type: "ai_interview_reminder",
        version: context.invitationVersion,
      }),
      interviewRecordId: context.interviewRecordId,
      nextAttemptAt: reminder.availableAt,
      organizationId: context.organizationId,
      payloadSnapshot,
      scheduleEntryId: input.scheduleEntryId,
      scopeType: "ai_round",
      type: "ai_interview_reminder",
    });
  }
}

export async function enqueueAiInvitationResponseEvent(
  tx: Transaction,
  input: {
    action: "accept" | "decline";
    invitationVersion: number;
    respondedAt: Date;
    scheduleEntryId: string;
  },
): Promise<void> {
  const [context] = await tx
    .select({
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      initiatorEmail: user.email,
      initiatorName: user.name,
      interviewRecordId: studioInterview.id,
      jobName: studioInterview.targetRole,
      organizationId: studioInterview.organizationId,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduledAt: studioInterviewSchedule.scheduledAt,
      workspaceName: organization.name,
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
    .where(eq(studioInterviewSchedule.id, input.scheduleEntryId))
    .limit(1);
  if (!context) {
    throw new Error("AI 面试邀请响应缺少轮次上下文。");
  }
  const type = input.action === "accept" ? "ai_invitation_accepted" : "ai_invitation_declined";
  await enqueuePreparedInterviewNotificationEvent(tx, {
    actorUserId: null,
    dedupeKey: buildInterviewNotificationDedupeKey({
      scopeId: input.scheduleEntryId,
      type,
      version: input.invitationVersion,
    }),
    interviewRecordId: context.interviewRecordId,
    organizationId: context.organizationId,
    payloadSnapshot: {
      candidateName: context.candidateName,
      companyName: resolveInterviewNotificationCompanyName(
        context.configuredCompanyName,
        context.workspaceName,
      ),
      initiatorName: context.initiatorName ?? undefined,
      interviewLink: absoluteAppUrl(
        buildInterviewLink(context.interviewRecordId, input.scheduleEntryId),
      ),
      interviewStartTime: context.scheduledAt?.toISOString(),
      interviewType: "ai",
      jobName: context.jobName ?? undefined,
      responseTime: input.respondedAt.toISOString(),
      roundName: context.roundLabel,
      schemaVersion: 1,
      supportContact: context.initiatorEmail ?? undefined,
      timeZone: "Asia/Shanghai",
    },
    scheduleEntryId: input.scheduleEntryId,
    scopeType: "ai_round",
    type,
  });
}

const AI_INVITATION_EXCEPTION_COPY = {
  invitation_expired: {
    label: "邀请已过期",
    suggestedAction: "请重新发起面试邀请，或人工联系候选人确认面试意向。",
  },
  response_conflict: {
    label: "确认状态冲突",
    suggestedAction: "请人工联系候选人确认最终面试意向，必要时重新发起邀请。",
  },
  system_error: {
    label: "系统处理失败",
    suggestedAction: "请让候选人稍后重试；如持续失败，请人工确认并联系系统责任人。",
  },
} as const satisfies Record<AiInvitationExceptionType, { label: string; suggestedAction: string }>;

export async function enqueueAiInvitationExceptionEvent(
  tx: Transaction,
  input: {
    exceptionType: AiInvitationExceptionType;
    occurredAt?: Date;
    scheduleEntryId: string;
  },
): Promise<void> {
  const [context] = await tx
    .select({
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      initiatorEmail: user.email,
      initiatorName: user.name,
      interviewRecordId: studioInterview.id,
      invitationVersion: studioInterviewSchedule.invitationVersion,
      jobName: studioInterview.targetRole,
      organizationId: studioInterview.organizationId,
      roundLabel: studioInterviewSchedule.roundLabel,
      workspaceName: organization.name,
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
    .where(eq(studioInterviewSchedule.id, input.scheduleEntryId))
    .limit(1);
  if (!context) {
    return;
  }

  const copy = AI_INVITATION_EXCEPTION_COPY[input.exceptionType];
  await enqueuePreparedInterviewNotificationEvent(tx, {
    actorUserId: null,
    dedupeKey: buildInterviewNotificationDedupeKey({
      discriminator: input.exceptionType,
      scopeId: input.scheduleEntryId,
      type: "ai_invitation_exception",
      version: context.invitationVersion,
    }),
    interviewRecordId: context.interviewRecordId,
    organizationId: context.organizationId,
    payloadSnapshot: {
      candidateName: context.candidateName,
      companyName: resolveInterviewNotificationCompanyName(
        context.configuredCompanyName,
        context.workspaceName,
      ),
      exceptionType: copy.label,
      initiatorName: context.initiatorName ?? undefined,
      interviewType: "ai",
      jobName: context.jobName ?? undefined,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      roundName: context.roundLabel,
      schemaVersion: 1,
      suggestedAction: copy.suggestedAction,
      supportContact: context.initiatorEmail ?? undefined,
      timeZone: "Asia/Shanghai",
    },
    scheduleEntryId: input.scheduleEntryId,
    scopeType: "ai_round",
    type: "ai_invitation_exception",
  });
}

export async function enqueueAiInterviewCompletedEvent(
  tx: Transaction,
  input: { scheduleEntryId: string },
): Promise<void> {
  const [context] = await tx
    .select({
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      conversationId: studioInterviewSchedule.conversationId,
      createdBy: studioInterviewSchedule.createdBy,
      interviewRecordId: studioInterview.id,
      jobName: studioInterview.targetRole,
      organizationId: studioInterview.organizationId,
      organizationSlug: organization.slug,
      roundLabel: studioInterviewSchedule.roundLabel,
      workspaceName: organization.name,
    })
    .from(studioInterviewSchedule)
    .innerJoin(studioInterview, eq(studioInterview.id, studioInterviewSchedule.interviewRecordId))
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .where(eq(studioInterviewSchedule.id, input.scheduleEntryId))
    .limit(1);
  if (!context) {
    throw new Error("AI 面试完成通知缺少轮次上下文。");
  }
  const [conversation] = await tx
    .select({ dataCollectionResults: interviewConversation.dataCollectionResults })
    .from(interviewConversation)
    .where(
      context.conversationId
        ? eq(interviewConversation.conversationId, context.conversationId)
        : eq(interviewConversation.scheduleEntryId, input.scheduleEntryId),
    )
    .orderBy(desc(interviewConversation.updatedAt))
    .limit(1);
  const dataCollectionResults = parseInterviewDataCollectionResults(
    conversation?.dataCollectionResults,
  );
  const completionNotice = resolveAiInterviewCompletionNotice(
    dataCollectionResults,
    context.candidateName,
  );
  const isIncomplete = !isInterviewQuestionSetComplete(dataCollectionResults);
  await enqueuePreparedInterviewNotificationEvent(tx, {
    actorUserId: context.createdBy,
    dedupeKey: buildInterviewNotificationDedupeKey({
      scopeId: input.scheduleEntryId,
      type: "ai_interview_completed",
      version: 1,
    }),
    interviewRecordId: context.interviewRecordId,
    organizationId: context.organizationId,
    payloadSnapshot: {
      candidateName: context.candidateName,
      companyName: resolveInterviewNotificationCompanyName(
        context.configuredCompanyName,
        context.workspaceName,
      ),
      completionNotice,
      interviewLink: isIncomplete
        ? reportUrl(input.scheduleEntryId, context.organizationSlug)
        : undefined,
      interviewType: "ai",
      jobName: context.jobName ?? undefined,
      roundName: context.roundLabel,
      schemaVersion: 1,
      timeZone: "Asia/Shanghai",
    },
    scheduleEntryId: input.scheduleEntryId,
    scopeType: "ai_round",
    type: "ai_interview_completed",
  });
}

interface HumanMeetingEventInput {
  actorUserId: string | null;
  changeReason?: string | null;
  dedupeDiscriminator?: string;
  exceptionType?: string;
  humanRoundId?: string;
  meetingId: string;
  now?: Date;
  oldScheduledAt?: Date | null;
  oldValidUntil?: Date | null;
  scheduleVersion: number;
  suggestedAction?: string;
  type:
    | "human_interview_pending_schedule"
    | "human_candidate_invitation_requested"
    | "human_interviewer_confirmation_requested"
    | "human_interviewer_confirmed"
    | "human_interviewer_declined"
    | "human_interview_confirmed"
    | "human_interview_rescheduled"
    | "human_invitation_accepted"
    | "human_invitation_declined"
    | "human_invitation_exception"
    | "human_interviewer_added"
    | "human_interview_cancelled"
    | "human_interview_completed";
}

export function resolveHumanMeetingEventInterviewLink(input: {
  candidateInviteExpiresAt: Date | null;
  candidateInviteTokenHash: string | null;
  humanRoundId: string;
  interviewRecordId: string;
  meetingId: string;
  organizationSlug: string;
  type: HumanMeetingEventInput["type"];
}): string | undefined {
  if (input.type === "human_interview_completed") {
    return humanInterviewRecordUrl(input.interviewRecordId, input.organizationSlug);
  }
  if (!(input.candidateInviteExpiresAt && input.candidateInviteTokenHash)) {
    return undefined;
  }
  const token = buildCandidateInviteToken({
    exp: input.candidateInviteExpiresAt.getTime(),
    meetingId: input.meetingId,
    roundId: input.humanRoundId,
  });
  if (hashInviteToken(token) !== input.candidateInviteTokenHash) {
    return undefined;
  }
  return absoluteAppUrl(`/human-interview/${encodeURIComponent(token)}`);
}

export async function cancelPendingHumanMeetingReminders(
  tx: Transaction,
  meetingId: string,
): Promise<void> {
  const now = new Date();
  const cancelledEvents = await tx
    .update(interviewNotificationEvent)
    .set({
      completedAt: now,
      lastErrorCode: "notification-superseded",
      lastErrorMessage: "会议时间或状态已变更，旧提醒已取消。",
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "cancelled",
      updatedAt: now,
    })
    .where(
      and(
        eq(interviewNotificationEvent.humanMeetingId, meetingId),
        eq(interviewNotificationEvent.type, "human_interview_reminder"),
        inArray(interviewNotificationEvent.status, ["pending", "processing", "failed"]),
      ),
    )
    .returning({ id: interviewNotificationEvent.id });
  if (cancelledEvents.length === 0) {
    return;
  }
  await tx
    .update(interviewNotification)
    .set({
      error: "会议时间或状态已变更，旧提醒已取消。",
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: null,
      status: "cancelled",
      updatedAt: now,
    })
    .where(
      inArray(
        interviewNotification.eventId,
        cancelledEvents.map((event) => event.id),
      ),
    );
}

// oxlint-disable-next-line complexity -- event snapshots intentionally cover versioning, cancellation, and reminder scheduling together.
export async function enqueueHumanMeetingEvents(
  tx: Transaction,
  input: HumanMeetingEventInput,
): Promise<void> {
  if (
    input.type === "human_interview_rescheduled" ||
    input.type === "human_interview_cancelled" ||
    input.type === "human_interview_completed"
  ) {
    await cancelPendingHumanMeetingReminders(tx, input.meetingId);
  }

  const rows = await tx
    .select({
      candidateInviteExpiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
      candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
      candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      humanRoundId: studioHumanInterviewRound.id,
      initiatorEmail: user.email,
      initiatorName: user.name,
      interviewRecordId: studioInterview.id,
      jobName: studioInterview.targetRole,
      organizationId: studioHumanInterviewMeeting.organizationId,
      organizationSlug: organization.slug,
      roundName: studioHumanInterviewRound.label,
      roundSortOrder: studioHumanInterviewRound.sortOrder,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      validUntil: studioHumanInterviewMeeting.validUntil,
      workspaceName: organization.name,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
    )
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
    )
    .innerJoin(studioInterview, eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId))
    .innerJoin(organization, eq(organization.id, studioHumanInterviewMeeting.organizationId))
    .leftJoin(
      globalConfig,
      eq(globalConfig.organizationId, studioHumanInterviewMeeting.organizationId),
    )
    .leftJoin(user, eq(user.id, studioHumanInterviewMeeting.createdBy))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.meetingId),
        input.humanRoundId
          ? eq(studioHumanInterviewMeetingRound.roundId, input.humanRoundId)
          : undefined,
      ),
    );
  if (rows.length === 0) {
    throw new Error("真人面试通知事件缺少会议轮次上下文。");
  }

  const interviewerRows = await tx
    .select({ name: user.name })
    .from(studioHumanInterviewMeetingInterviewer)
    .innerJoin(user, eq(user.id, studioHumanInterviewMeetingInterviewer.userId))
    .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId));
  const interviewerNames = interviewerRows.map((row) => row.name).filter(Boolean);
  const now = input.now ?? new Date();

  for (const row of rows) {
    const roundProgression = await loadHumanInterviewRoundProgression(tx, {
      currentSortOrder: row.roundSortOrder,
      interviewRecordId: row.interviewRecordId,
    });
    const interviewLink = resolveHumanMeetingEventInterviewLink({
      candidateInviteExpiresAt: row.candidateInviteExpiresAt,
      candidateInviteTokenHash: row.candidateInviteTokenHash,
      humanRoundId: row.humanRoundId,
      interviewRecordId: row.interviewRecordId,
      meetingId: input.meetingId,
      organizationSlug: row.organizationSlug,
      type: input.type,
    });
    let evaluationSummary: string | undefined;
    if (input.type === "human_interview_completed") {
      const completedRounds = await tx
        .select({
          id: studioHumanInterviewRound.id,
          label: studioHumanInterviewRound.label,
        })
        .from(studioHumanInterviewRound)
        .where(
          and(
            eq(studioHumanInterviewRound.interviewRecordId, row.interviewRecordId),
            eq(studioHumanInterviewRound.status, "completed"),
            lte(studioHumanInterviewRound.sortOrder, row.roundSortOrder),
          ),
        )
        .orderBy(asc(studioHumanInterviewRound.sortOrder));
      const roundIds = completedRounds.map((round) => round.id);
      const roundInterviewerRows =
        roundIds.length === 0
          ? []
          : await tx
              .select({
                name: user.name,
                roundId: studioHumanInterviewRoundInterviewer.roundId,
              })
              .from(studioHumanInterviewRoundInterviewer)
              .innerJoin(user, eq(user.id, studioHumanInterviewRoundInterviewer.userId))
              .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds));
      evaluationSummary = buildHumanInterviewEvaluationSummary(
        completedRounds.map((round, index) => ({
          interviewerNames: roundInterviewerRows
            .filter((item) => item.roundId === round.id)
            .map((item) => item.name)
            .filter((name): name is string => Boolean(name)),
          label: round.label,
          roundNumber: index + 2,
        })),
      );
    }
    const payloadSnapshot = {
      candidateName: row.candidateName,
      changeReason: input.changeReason?.trim() || undefined,
      companyName: resolveInterviewNotificationCompanyName(
        row.configuredCompanyName,
        row.workspaceName,
      ),
      completedAt: input.type === "human_interview_completed" ? now.toISOString() : undefined,
      currentRoundNumber: roundProgression.currentRoundNumber,
      evaluationSummary,
      exceptionType: input.exceptionType,
      initiatorName: row.initiatorName ?? undefined,
      interviewEndTime: row.validUntil?.toISOString(),
      interviewLink,
      interviewStartTime: row.scheduledAt?.toISOString(),
      interviewType: "human" as const,
      interviewerNames,
      invitationEndTime: row.candidateInviteExpiresAt?.toISOString(),
      invitationStartTime: now.toISOString(),
      jobName: row.jobName ?? undefined,
      occurredAt: input.type === "human_invitation_exception" ? now.toISOString() : undefined,
      oldInterviewEndTime: input.oldValidUntil?.toISOString(),
      oldInterviewStartTime: input.oldScheduledAt?.toISOString(),
      previousRoundName: roundProgression.previousRoundName,
      previousRoundNumber: roundProgression.previousRoundNumber,
      responseTime:
        input.type === "human_invitation_accepted" || input.type === "human_invitation_declined"
          ? now.toISOString()
          : undefined,
      roundName: row.roundName,
      schemaVersion: 1 as const,
      suggestedAction: input.suggestedAction,
      supportContact: row.initiatorEmail ?? undefined,
      timeZone: "Asia/Shanghai",
    };
    await enqueuePreparedInterviewNotificationEvent(tx, {
      actorUserId: input.actorUserId,
      dedupeKey: buildInterviewNotificationDedupeKey({
        discriminator: input.dedupeDiscriminator
          ? `${row.interviewRecordId}:${input.dedupeDiscriminator}`
          : row.interviewRecordId,
        scopeId: input.meetingId,
        type: input.type,
        version: input.scheduleVersion,
      }),
      humanMeetingId: input.meetingId,
      humanRoundId: row.humanRoundId,
      interviewRecordId: row.interviewRecordId,
      organizationId: row.organizationId,
      payloadSnapshot,
      scopeType: "human_meeting",
      type: input.type,
    });

    const shouldScheduleReminders =
      input.type === "human_interview_confirmed" ||
      (input.type === "human_interview_rescheduled" && row.candidateInviteStatus === "accepted");
    if (!shouldScheduleReminders) {
      continue;
    }
    for (const reminder of buildInterviewReminderSchedule(row.scheduledAt, now)) {
      const reminderType: InterviewNotificationEventType = "human_interview_reminder";
      await enqueuePreparedInterviewNotificationEvent(tx, {
        actorUserId: input.actorUserId,
        availableAt: reminder.availableAt,
        dedupeKey: buildInterviewNotificationDedupeKey({
          discriminator: `${row.interviewRecordId}:${reminder.offsetMinutes}`,
          scopeId: input.meetingId,
          type: reminderType,
          version: input.scheduleVersion,
        }),
        humanMeetingId: input.meetingId,
        humanRoundId: row.humanRoundId,
        interviewRecordId: row.interviewRecordId,
        nextAttemptAt: reminder.availableAt,
        organizationId: row.organizationId,
        payloadSnapshot: {
          ...payloadSnapshot,
          reminderLeadTime: reminder.offsetMinutes === 1440 ? "24 小时" : "1 小时",
        },
        scopeType: "human_meeting",
        type: reminderType,
      });
    }
  }
}

export async function enqueueAiReportReadyEvent(
  tx: Transaction,
  input: { conversationId: string; interviewRecordId: string },
) {
  const [context] = await tx
    .select({
      candidateName: studioInterview.candidateName,
      configuredCompanyName: globalConfig.companyName,
      createdBy: studioInterviewSchedule.createdBy,
      initiatorName: user.name,
      jobName: studioInterview.targetRole,
      organizationId: studioInterview.organizationId,
      organizationSlug: organization.slug,
      roundLabel: studioInterviewSchedule.roundLabel,
      scheduleEntryId: interviewConversation.scheduleEntryId,
      workspaceName: organization.name,
    })
    .from(interviewConversation)
    .innerJoin(studioInterview, eq(studioInterview.id, interviewConversation.interviewRecordId))
    .innerJoin(
      studioInterviewSchedule,
      eq(studioInterviewSchedule.id, interviewConversation.scheduleEntryId),
    )
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .leftJoin(user, eq(user.id, studioInterviewSchedule.createdBy))
    .where(eq(interviewConversation.conversationId, input.conversationId))
    .limit(1);

  if (!context?.scheduleEntryId) {
    throw new Error("AI 报告通知事件缺少面试上下文。");
  }
  return enqueuePreparedInterviewNotificationEvent(tx, {
    actorUserId: context.createdBy,
    conversationId: input.conversationId,
    dedupeKey: buildInterviewNotificationDedupeKey({
      discriminator: input.conversationId,
      scopeId: context.scheduleEntryId,
      type: "ai_report_ready",
      version: 1,
    }),
    interviewRecordId: input.interviewRecordId,
    organizationId: context.organizationId,
    payloadSnapshot: {
      candidateName: context.candidateName,
      companyName: resolveInterviewNotificationCompanyName(
        context.configuredCompanyName,
        context.workspaceName,
      ),
      initiatorName: context.initiatorName ?? undefined,
      interviewLink: reportUrl(context.scheduleEntryId, context.organizationSlug),
      interviewType: "ai",
      jobName: context.jobName ?? undefined,
      roundName: context.roundLabel,
      schemaVersion: 1,
      timeZone: "Asia/Shanghai",
    },
    scheduleEntryId: context.scheduleEntryId,
    scopeType: "ai_round",
    type: "ai_report_ready",
  });
}
