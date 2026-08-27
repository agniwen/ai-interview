import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { enqueueHumanMeetingEvents } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/feature-flags";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
} from "@arc/db-schema/schema";
import type {
  AiInvitationExceptionType,
  CandidateInterviewInvitationStatus,
} from "@arc/db-schema/interview-notifications";
import {
  decodeCandidateInviteToken,
  hashInviteToken,
  HumanInterviewMeetingError,
} from "./human-interview-meeting-access";
import { enqueueHumanMeetingConfirmedIfReady } from "./human-interview-confirmation-readiness";

const HUMAN_INVITATION_EXCEPTION_COPY = {
  invitation_expired: {
    label: "邀请已过期",
    suggestedAction: "请重新发起本次面试邀请，或人工联系候选人确认面试意向。",
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

export async function isCurrentHumanInterviewInvitationToken(
  inviteToken: string,
): Promise<boolean> {
  const payload = decodeCandidateInviteToken(inviteToken);
  if (!payload) {
    return false;
  }
  const [row] = await db
    .select({ tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash })
    .from(studioHumanInterviewMeetingRound)
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
        eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
      ),
    )
    .limit(1);
  return row?.tokenHash === hashInviteToken(inviteToken);
}

export async function recordHumanInterviewInvitationException(input: {
  exceptionType: AiInvitationExceptionType;
  inviteToken: string;
}): Promise<boolean> {
  if (!isInterviewNotificationFlowEnabled()) {
    return false;
  }
  const payload = decodeCandidateInviteToken(input.inviteToken);
  if (!payload) {
    return false;
  }
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        invitationVersion: studioHumanInterviewMeetingRound.invitationVersion,
        scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
        tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
        ),
      )
      .limit(1)
      .for("update");
    if (!row || row.tokenHash !== hashInviteToken(input.inviteToken)) {
      return false;
    }
    const copy = HUMAN_INVITATION_EXCEPTION_COPY[input.exceptionType];
    await enqueueHumanMeetingEvents(tx, {
      actorUserId: null,
      dedupeDiscriminator: `${input.exceptionType}:${row.invitationVersion}`,
      exceptionType: copy.label,
      humanRoundId: payload.roundId,
      meetingId: payload.meetingId,
      scheduleVersion: row.scheduleVersion,
      suggestedAction: copy.suggestedAction,
      type: "human_invitation_exception",
    });
    return true;
  });
}

async function tryRecordHumanInterviewInvitationException(
  exceptionType: AiInvitationExceptionType,
  inviteToken: string,
): Promise<void> {
  try {
    await recordHumanInterviewInvitationException({ exceptionType, inviteToken });
  } catch (notificationError) {
    console.error("[human-invitation-exception-notification] failed", {
      error: notificationError,
      exceptionType,
    });
  }
}

export async function handleHumanInterviewInvitationResponseError(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- public route catch boundary normalizes expected and unexpected failures.
  error: unknown,
  inviteToken: string,
): Promise<{
  body: { code: string; error: string; title: string };
  status: 400 | 403 | 404 | 409 | 410 | 500;
}> {
  if (error instanceof HumanInterviewMeetingError) {
    let exceptionType: AiInvitationExceptionType | null = null;
    if (error.status === 410) {
      exceptionType = "invitation_expired";
    } else if (error.status === 409) {
      exceptionType = "response_conflict";
    }
    if (exceptionType) {
      await tryRecordHumanInterviewInvitationException(exceptionType, inviteToken);
    }
    return {
      body: {
        code: exceptionType ?? "invalid_link",
        error: error.message,
        title: exceptionType ? "接受面试异常" : "邀请链接无效",
      },
      status: error.status,
    };
  }

  await tryRecordHumanInterviewInvitationException("system_error", inviteToken);
  const response = createInternalErrorResponse({
    error,
    operation: "respond-human-interview-invitation",
    publicMessage:
      "暂时无法确认您的面试安排，请稍后重试。如果多次尝试仍然失败，请联系招聘负责人协调处理。",
  });
  return {
    body: { ...response, code: "system_error", title: "接受面试异常" },
    status: 500,
  };
}

export function respondHumanInterviewCandidateInvitation(input: {
  action: "accept" | "decline";
  declineReason?: string | null;
  inviteToken: string;
}): Promise<{ status: CandidateInterviewInvitationStatus }> {
  const payload = decodeCandidateInviteToken(input.inviteToken);
  if (!payload) {
    throw new HumanInterviewMeetingError("真人复面链接不可用。", 404);
  }
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        expiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
        invitationVersion: studioHumanInterviewMeetingRound.invitationVersion,
        meetingStatus: studioHumanInterviewMeeting.status,
        organizationId: studioHumanInterviewMeeting.organizationId,
        scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
        status: studioHumanInterviewMeetingRound.candidateInviteStatus,
        tokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeeting.id, studioHumanInterviewMeetingRound.meetingId),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) {
      throw new HumanInterviewMeetingError("真人复面链接不可用。", 404);
    }
    if (row.expiresAt === null || row.expiresAt <= now || payload.exp < now.getTime()) {
      throw new HumanInterviewMeetingError("真人复面链接已过期。", 410);
    }
    if (hashInviteToken(input.inviteToken) !== row.tokenHash) {
      throw new HumanInterviewMeetingError("面试安排已发生变化，请使用最新邀请链接。", 409);
    }
    if (row.meetingStatus === "cancelled" || row.meetingStatus === "ended") {
      throw new HumanInterviewMeetingError("该真人复面会议已结束或取消。", 409);
    }
    const nextStatus = input.action === "accept" ? "accepted" : "declined";
    if (row.status === nextStatus) {
      return { status: nextStatus };
    }
    if (row.status === "accepted" || row.status === "declined") {
      throw new HumanInterviewMeetingError("候选人已提交邀请响应，不能重复变更。", 409);
    }
    await tx
      .update(studioHumanInterviewMeetingRound)
      .set({
        candidateDeclineReason:
          input.action === "decline" ? input.declineReason?.trim() || null : null,
        candidateInviteStatus: nextStatus,
        candidateRespondedAt: now,
      })
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
        ),
      );
    if (isInterviewNotificationFlowEnabled()) {
      await enqueueHumanMeetingEvents(tx, {
        actorUserId: null,
        dedupeDiscriminator: `candidate-response:${row.invitationVersion}`,
        humanRoundId: payload.roundId,
        meetingId: payload.meetingId,
        now,
        scheduleVersion: row.scheduleVersion,
        type: input.action === "accept" ? "human_invitation_accepted" : "human_invitation_declined",
      });
      if (input.action === "accept") {
        await enqueueHumanMeetingConfirmedIfReady(tx, {
          actorUserId: null,
          meetingId: payload.meetingId,
          now,
        });
      }
    }
    return { status: nextStatus };
  });
}
