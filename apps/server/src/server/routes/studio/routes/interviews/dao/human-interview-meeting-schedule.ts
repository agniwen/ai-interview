import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
} from "@app/db-schema/schema";
import type { HumanInterviewMeetingScheduleUpdate } from "@app/db-schema/studio-interviews";
import type { HumanInterviewMeetingRecord } from "@app/shared/studio-pipeline-stages";
import {
  buildCandidateInviteToken,
  buildInviteExpiry,
  hashInviteToken,
  HumanInterviewMeetingError,
  resolveValidUntilInput,
} from "./human-interview-meeting-access";
import { loadHumanInterviewMeetingById } from "./human-interview-meetings";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";

export async function updateHumanInterviewMeetingSchedule({
  actorUserId,
  input,
  meetingId,
  organizationId,
}: {
  actorUserId: string | null;
  input: HumanInterviewMeetingScheduleUpdate;
  meetingId: string;
  organizationId: string;
}): Promise<HumanInterviewMeetingRecord> {
  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new HumanInterviewMeetingError("请输入有效的面试时间。", 400);
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.id, meetingId),
          eq(humanInterviewMeeting.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
    }
    if (existing.status !== "scheduled") {
      throw new HumanInterviewMeetingError("已开始、已结束或已取消的会议不能调整时间。", 400);
    }
    if (existing.feishuProviderId && existing.feishuSyncStatus === "pending") {
      throw new HumanInterviewMeetingError("飞书会议尚未同步完成，请先完成同步再调整时间。", 400);
    }
    if (existing.feishuSyncStatus === "creating") {
      throw new HumanInterviewMeetingError("飞书会议正在同步，请稍后再调整时间。", 400);
    }
    if (existing.feishuSyncStatus === "unknown") {
      throw new HumanInterviewMeetingError(
        "历史飞书同步结果未知，请先在飞书中核查后再调整时间。",
        400,
      );
    }

    const validUntil = resolveValidUntilInput({
      existingValidUntil: existing.validUntil,
      scheduledAt,
      validUntil: input.validUntil,
    });
    const now = new Date();
    const roundLinks = await tx
      .select({
        candidateInviteStatus: humanInterviewMeetingRound.candidateInviteStatus,
        candidateInviteTokenHash: humanInterviewMeetingRound.candidateInviteTokenHash,
        candidateRespondedAt: humanInterviewMeetingRound.candidateRespondedAt,
        invitationVersion: humanInterviewMeetingRound.invitationVersion,
        roundId: humanInterviewMeetingRound.roundId,
      })
      .from(humanInterviewMeetingRound)
      .where(eq(humanInterviewMeetingRound.meetingId, meetingId));

    await tx
      .update(humanInterviewMeeting)
      .set({
        feishuLastError: null,
        feishuSyncStatus: existing.feishuProviderId ? "pending" : null,
        scheduleVersion: sql`${humanInterviewMeeting.scheduleVersion} + 1`,
        scheduledAt,
        updatedAt: now,
        validUntil,
      })
      .where(eq(humanInterviewMeeting.id, meetingId));
    if (roundLinks.length > 0) {
      const nextScheduleVersion = existing.scheduleVersion + 1;
      await tx
        .update(humanInterviewRound)
        .set({ scheduledAt, updatedAt: now })
        .where(
          inArray(
            humanInterviewRound.id,
            roundLinks.map((round) => round.roundId),
          ),
        );
      for (const roundLink of roundLinks) {
        const candidateInviteExpiresAt = new Date(buildInviteExpiry(now.getTime()));
        const candidateInviteTokenHash = roundLink.candidateInviteTokenHash
          ? hashInviteToken(
              buildCandidateInviteToken({
                exp: candidateInviteExpiresAt.getTime(),
                meetingId,
                roundId: roundLink.roundId,
              }),
            )
          : null;
        await tx
          .update(humanInterviewMeetingRound)
          .set({
            candidateDeclineReason:
              roundLink.candidateInviteStatus === "declined" ? undefined : null,
            candidateInviteExpiresAt: roundLink.candidateInviteTokenHash
              ? candidateInviteExpiresAt
              : null,
            candidateInviteStatus: roundLink.candidateInviteStatus,
            candidateInviteTokenHash,
            candidateRespondedAt: roundLink.candidateRespondedAt,
            invitationVersion:
              roundLink.candidateInviteStatus === "accepted" ||
              roundLink.candidateInviteStatus === "declined"
                ? roundLink.invitationVersion
                : sql`${humanInterviewMeetingRound.invitationVersion} + 1`,
          })
          .where(
            and(
              eq(humanInterviewMeetingRound.meetingId, meetingId),
              eq(humanInterviewMeetingRound.roundId, roundLink.roundId),
            ),
          );
      }
      const roundIds = roundLinks.map((round) => round.roundId);
      await tx
        .update(humanInterviewRoundInterviewer)
        .set({
          confirmedAt: now,
          confirmedScheduleVersion: nextScheduleVersion,
          declineReason: null,
          declinedAt: null,
          status: "confirmed",
        })
        .where(inArray(humanInterviewRoundInterviewer.roundId, roundIds));
    }
    if (isInterviewNotificationFlowEnabled()) {
      await enqueueHumanMeetingEvents(tx, {
        actorUserId,
        changeReason: input.reason,
        meetingId,
        now,
        oldScheduledAt: existing.scheduledAt,
        oldValidUntil: existing.validUntil,
        scheduleVersion: existing.scheduleVersion + 1,
        type: "human_interview_rescheduled",
      });
    }
  });

  const updated = await loadHumanInterviewMeetingById(meetingId, organizationId);
  if (!updated) {
    throw new Error("更新真人复面会议后查询失败");
  }
  return updated;
}
