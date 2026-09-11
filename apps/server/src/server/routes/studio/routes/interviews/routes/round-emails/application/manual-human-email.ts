import { createHash } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  recruitingNotificationEvent,
} from "@app/db-schema/schema";
import { interviewNotificationPayloadSnapshotSchema } from "@app/db-schema/interview-notifications";
import type { InterviewNotificationPayloadSnapshot } from "@app/db-schema/interview-notifications";
import {
  availableManualHumanEmails,
  manualHumanEmailLabels,
  manualHumanEmailBlockedReason,
} from "@app/shared/manual-human-email";
import type { ManualHumanEmailType } from "@app/shared/manual-human-email";
import { renderInterviewNotificationTemplate } from "@app/shared/interview-notifications";
import { db } from "../../../../../../../../lib/server/db";
import type { Transaction } from "../../../../../../../interview-notifications/dao";
import {
  createInterviewNotificationDelivery,
  enqueueInterviewNotificationEvent,
} from "../../../../../../../interview-notifications/dao";
import { CORE_INTERVIEW_NOTIFICATION_TEMPLATES } from "../../../../../../../interview-notifications/utils/templates";
import {
  buildHumanInterviewRoundProgression,
  resolveHumanMeetingEventInterviewLink,
} from "../../../../../../../interview-notifications/utils/events";
import { getGlobalConfig } from "../../../../global-config/dao";
import { loadResumeDetail } from "../../../../resumes/dao/resumes";
import type { RecruitingVisibilityScope } from "../../../../../../../access/recruiting-visibility";
import {
  ManualInvitationError,
  signManualInvitationPreview,
  verifyManualInvitationPreview,
} from "./default-manual-ai-invitation";

interface Actor {
  actorUserId: string;
  organizationId: string;
  meetingId: string;
  roundId: string;
  visibility: RecruitingVisibilityScope;
}
const confirmationTtl = 10 * 60_000;

export function currentReschedulePayload(
  value: InterviewNotificationPayloadSnapshot | undefined,
  meeting: { scheduledAt: Date | null; validUntil: Date | null },
) {
  const parsed = interviewNotificationPayloadSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const change = parsed.data;
  return change.oldInterviewStartTime &&
    change.oldInterviewEndTime &&
    change.interviewStartTime === meeting.scheduledAt?.toISOString() &&
    change.interviewEndTime === meeting.validUntil?.toISOString() &&
    (change.oldInterviewStartTime !== change.interviewStartTime ||
      change.oldInterviewEndTime !== change.interviewEndTime)
    ? change
    : null;
}

async function loadContext(tx: Transaction, actor: Actor) {
  const [meeting] = await tx
    .select()
    .from(humanInterviewMeeting)
    .where(
      and(
        eq(humanInterviewMeeting.id, actor.meetingId),
        eq(humanInterviewMeeting.organizationId, actor.organizationId),
      ),
    )
    .for("update");
  const [round] = await tx
    .select()
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.id, actor.roundId),
        eq(humanInterviewRound.organizationId, actor.organizationId),
      ),
    );
  const [link] = await tx
    .select()
    .from(humanInterviewMeetingRound)
    .where(
      and(
        eq(humanInterviewMeetingRound.meetingId, actor.meetingId),
        eq(humanInterviewMeetingRound.roundId, actor.roundId),
        eq(humanInterviewMeetingRound.organizationId, actor.organizationId),
      ),
    );
  if (!meeting || !round || !link) {
    throw new ManualInvitationError("面试不存在或无权查看。", 404);
  }
  if (!(await loadResumeDetail(round.recruitingRecordId, actor.organizationId, actor.visibility))) {
    throw new ManualInvitationError("面试不存在或无权查看。", 404);
  }
  const [record] = await tx
    .select()
    .from(recruitingRecordReadModel)
    .where(eq(recruitingRecordReadModel.id, round.recruitingRecordId));
  if (!record) {
    throw new ManualInvitationError("候选人不存在。", 404);
  }
  const email = z.email().safeParse(record.candidateEmail?.trim());
  if (!email.success) {
    throw new ManualInvitationError("请先为候选人填写有效邮箱。", 400);
  }
  const [rescheduledEvent] = await tx
    .select()
    .from(recruitingNotificationEvent)
    .where(
      and(
        eq(recruitingNotificationEvent.organizationId, actor.organizationId),
        eq(recruitingNotificationEvent.humanRoundId, actor.roundId),
        eq(
          recruitingNotificationEvent.dedupeKey,
          `human_interview_rescheduled:${meeting.id}:${meeting.scheduleVersion}:${record.id}`,
        ),
      ),
    )
    .limit(1);
  const change = currentReschedulePayload(rescheduledEvent?.payloadSnapshot, meeting);
  const hasCurrentReschedule = Boolean(change);
  const interviewLink = resolveHumanMeetingEventInterviewLink({
    candidateInviteExpiresAt: link.candidateInviteExpiresAt,
    candidateInviteTokenHash: link.candidateInviteTokenHash,
    humanRoundId: round.id,
    interviewRecordId: record.id,
    meetingId: meeting.id,
    organizationSlug: "",
    type: "human_candidate_invitation_requested",
  });
  const now = new Date();
  const emailContext = {
    candidateStatus: link.candidateInviteStatus,
    expiresAt: link.candidateInviteExpiresAt,
    hasCurrentReschedule,
    hasValidLink: Boolean(interviewLink),
    meetingStatus: meeting.status,
    now,
    roundStatus: round.status,
    scheduledAt: meeting.scheduledAt,
    startedAt: meeting.startedAt,
    validUntil: meeting.validUntil,
  };
  const available = availableManualHumanEmails(emailContext);
  const blockedReason = manualHumanEmailBlockedReason(emailContext);
  const passed = await tx
    .select({ label: humanInterviewRound.label })
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.organizationId, actor.organizationId),
        eq(humanInterviewRound.recruitingRecordId, record.id),
        lt(humanInterviewRound.sortOrder, round.sortOrder),
        eq(humanInterviewRound.status, "completed"),
        eq(humanInterviewRound.outcome, "pass"),
      ),
    )
    .orderBy(asc(humanInterviewRound.sortOrder));
  const config = await getGlobalConfig(actor.organizationId);
  const payload: InterviewNotificationPayloadSnapshot = {
    ...buildHumanInterviewRoundProgression(passed),
    candidateName: record.candidateName,
    companyName: config.companyName,
    interviewEndTime: meeting.validUntil?.toISOString(),
    interviewLink,
    interviewStartTime: meeting.scheduledAt?.toISOString(),
    interviewType: "human",
    invitationEndTime: link.candidateInviteExpiresAt?.toISOString(),
    invitationStartTime: meeting.createdAt.toISOString(),
    jobName: record.targetRole ?? undefined,
    oldInterviewEndTime: change?.oldInterviewEndTime,
    oldInterviewStartTime: change?.oldInterviewStartTime,
    roundName: round.label,
    schemaVersion: 1,
    timeZone: "Asia/Shanghai",
  };
  return { available, blockedReason, email: email.data, link, meeting, payload, record, round };
}

function render(
  context: Awaited<ReturnType<typeof loadContext>>,
  type: ManualHumanEmailType,
  referenceTime: number,
) {
  const template = CORE_INTERVIEW_NOTIFICATION_TEMPLATES.find(
    (item) =>
      item.eventType === type && item.audienceType === "candidate" && item.channel === "email",
  );
  if (!template?.subjectTemplate) {
    throw new ManualInvitationError("该通知模板暂不可用。");
  }
  const payload = { ...context.payload };
  if (type === "human_interview_cancelled") {
    payload.interviewLink = undefined;
  }
  if (type === "human_interview_reminder") {
    payload.reminderLeadTime = `约 ${Math.max(1, Math.ceil(((context.meeting.scheduledAt?.getTime() ?? referenceTime) - referenceTime) / 60_000))} 分钟`;
  }
  const subject = renderInterviewNotificationTemplate(template.subjectTemplate, payload);
  const text = renderInterviewNotificationTemplate(template.contentTemplate, payload);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        candidateStatus: context.link.candidateInviteStatus,
        email: context.email,
        invitationVersion: context.link.invitationVersion,
        meetingId: context.meeting.id,
        meetingStatus: context.meeting.status,
        payload,
        roundId: context.round.id,
        roundStatus: context.round.status,
        scheduleVersion: context.meeting.scheduleVersion,
        subject,
        text,
        type,
      }),
    )
    .digest("hex");
  return { fingerprint, payload, subject, text };
}

export async function previewManualHumanEmail(actor: Actor) {
  return await db.transaction(async (tx) => {
    const context = await loadContext(tx, actor);
    const referenceTime = Date.now();
    return {
      blockedReason: context.blockedReason,
      candidateName: context.record.candidateName,
      candidateStatus: context.link.candidateInviteStatus,
      meetingStatus: context.meeting.status,
      oldEnd: context.payload.oldInterviewEndTime ?? null,
      oldStart: context.payload.oldInterviewStartTime ?? null,
      options: context.available.map((type) => ({
        confirmationToken: signManualInvitationPreview({
          actorUserId: actor.actorUserId,
          expiresAt: referenceTime + confirmationTtl,
          fingerprint: render(context, type, referenceTime).fingerprint,
          organizationId: actor.organizationId,
          requestId: crypto.randomUUID(),
          roundId: actor.roundId,
        }),
        label: manualHumanEmailLabels[type],
        type,
      })),
      recipient: context.email,
      roundName: context.round.label,
      roundStatus: context.round.status,
      scheduledAt: context.meeting.scheduledAt?.toISOString() ?? null,
      validUntil: context.meeting.validUntil?.toISOString() ?? null,
    };
  });
}

export async function confirmManualHumanEmail(
  actor: Actor,
  type: ManualHumanEmailType,
  token: string,
) {
  const authorization = verifyManualInvitationPreview(token, actor);
  return await db.transaction(async (tx) => {
    const context = await loadContext(tx, actor);
    if (!context.available.includes(type)) {
      throw new ManualInvitationError("面试状态已变化，不能发送该类型通知，请重新打开弹窗。");
    }
    const snapshot = render(context, type, authorization.expiresAt - confirmationTtl);
    if (snapshot.fingerprint !== authorization.fingerprint) {
      throw new ManualInvitationError("收件人、时间或通知内容已变化，请重新打开弹窗后确认。");
    }
    const manualHumanEmail = {
      confirmedAt: new Date().toISOString(),
      confirmedBy: actor.actorUserId,
      eventType: type,
      meetingId: actor.meetingId,
      organizationId: actor.organizationId,
      recipient: context.email,
      requestId: authorization.requestId,
      roundId: actor.roundId,
      subject: snapshot.subject,
      text: snapshot.text,
      version: 1 as const,
    };
    const event = await enqueueInterviewNotificationEvent(tx, {
      actorUserId: actor.actorUserId,
      dedupeKey: `manual-human-email:${actor.organizationId}:${actor.meetingId}:${actor.roundId}:${authorization.requestId}`,
      humanMeetingId: actor.meetingId,
      humanRoundId: actor.roundId,
      interviewRecordId: context.record.id,
      organizationId: actor.organizationId,
      payloadSnapshot: { ...snapshot.payload, manualHumanEmail },
      scopeType: "human_meeting",
      type,
    });
    const delivery = await createInterviewNotificationDelivery(tx, {
      audienceType: "candidate",
      channel: "email",
      eventId: event.id,
      interviewRecordId: context.record.id,
      organizationId: actor.organizationId,
      providerId: "resend",
      providerRequestKey: `${event.id}:manual-human-email`,
      recipientAddress: context.email,
      recipientDisplayName: context.record.candidateName,
      renderedContent: snapshot.text,
      renderedSubject: snapshot.subject,
      templateVersionId: null,
      type,
    });
    return { deliveryId: delivery.id, status: delivery.status };
  });
}
