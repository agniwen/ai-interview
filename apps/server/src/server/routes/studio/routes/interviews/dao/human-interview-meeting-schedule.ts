/* oxlint-disable complexity -- one transaction keeps meeting, rounds, interviewers, invitations, and notification state atomic. */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
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
import { validateHumanInterviewMeetingInterviewerIds } from "./human-interview-meeting-input";

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
  const interviewerIds = input.interviewerIds
    ? await validateHumanInterviewMeetingInterviewerIds({
        interviewerIds: input.interviewerIds,
        organizationId,
      })
    : null;

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
    if (existing.status !== "scheduled" && existing.status !== "not_held") {
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
    const reopeningNotHeldMeeting = existing.status === "not_held";
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
        attendanceAlertedAt: null,
        endedAt: reopeningNotHeldMeeting ? null : existing.endedAt,
        establishedAt: null,
        feishuLastError: null,
        feishuSyncStatus: existing.feishuProviderId ? "pending" : null,
        lifecycleOccurredAt: reopeningNotHeldMeeting ? null : existing.lifecycleOccurredAt,
        lifecycleSource: reopeningNotHeldMeeting ? null : existing.lifecycleSource,
        scheduleVersion: sql`${humanInterviewMeeting.scheduleVersion} + 1`,
        scheduledAt,
        startedAt: reopeningNotHeldMeeting ? null : existing.startedAt,
        status: reopeningNotHeldMeeting ? "scheduled" : existing.status,
        updatedAt: now,
        validUntil,
      })
      .where(eq(humanInterviewMeeting.id, meetingId));
    if (roundLinks.length > 0) {
      const nextScheduleVersion = existing.scheduleVersion + 1;
      if (interviewerIds) {
        const currentMeetingInterviewers = await tx
          .select({
            role: humanInterviewMeetingInterviewer.role,
            userId: humanInterviewMeetingInterviewer.userId,
          })
          .from(humanInterviewMeetingInterviewer)
          .where(eq(humanInterviewMeetingInterviewer.meetingId, meetingId));
        const currentMeetingInterviewerIds = new Set(
          currentMeetingInterviewers.map((interviewer) => interviewer.userId),
        );
        await tx
          .delete(humanInterviewMeetingInterviewer)
          .where(
            and(
              eq(humanInterviewMeetingInterviewer.meetingId, meetingId),
              notInArray(humanInterviewMeetingInterviewer.userId, interviewerIds),
            ),
          );
        const addedMeetingInterviewerIds = interviewerIds.filter(
          (interviewerId) => !currentMeetingInterviewerIds.has(interviewerId),
        );
        if (addedMeetingInterviewerIds.length > 0) {
          await tx.insert(humanInterviewMeetingInterviewer).values(
            addedMeetingInterviewerIds.map((userId) => ({
              meetingId,
              organizationId,
              role: "interviewer" as const,
              userId,
            })),
          );
        }
        const retainedHost = currentMeetingInterviewers.find(
          (interviewer) =>
            interviewer.role === "host" && interviewerIds.includes(interviewer.userId),
        );
        if (!retainedHost) {
          const currentRoles = new Map(
            currentMeetingInterviewers.map((interviewer) => [interviewer.userId, interviewer.role]),
          );
          const nextHostId =
            interviewerIds.find((userId) => currentRoles.get(userId) !== "observer") ??
            interviewerIds[0];
          await tx
            .update(humanInterviewMeetingInterviewer)
            .set({ role: "host" })
            .where(
              and(
                eq(humanInterviewMeetingInterviewer.meetingId, meetingId),
                eq(humanInterviewMeetingInterviewer.userId, nextHostId),
              ),
            );
        }
      }
      await tx
        .update(humanInterviewRound)
        .set({ scheduledAt, updatedAt: now })
        .where(
          inArray(
            humanInterviewRound.id,
            roundLinks.map((round) => round.roundId),
          ),
        );
      await tx
        .update(humanInterviewMeetingRound)
        .set({ joinedAt: null, leftAt: null })
        .where(eq(humanInterviewMeetingRound.meetingId, meetingId));
      await tx
        .update(humanInterviewMeetingInterviewer)
        .set({ joinedAt: null, leftAt: null })
        .where(eq(humanInterviewMeetingInterviewer.meetingId, meetingId));
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
      if (interviewerIds) {
        await tx
          .delete(humanInterviewRoundInterviewer)
          .where(
            and(
              inArray(humanInterviewRoundInterviewer.roundId, roundIds),
              notInArray(humanInterviewRoundInterviewer.userId, interviewerIds),
            ),
          );
        for (const roundId of roundIds) {
          const currentAssignments = await tx
            .select({ userId: humanInterviewRoundInterviewer.userId })
            .from(humanInterviewRoundInterviewer)
            .where(eq(humanInterviewRoundInterviewer.roundId, roundId));
          const currentAssignmentIds = new Set(
            currentAssignments.map((assignment) => assignment.userId),
          );
          const addedAssignmentIds = interviewerIds.filter(
            (interviewerId) => !currentAssignmentIds.has(interviewerId),
          );
          if (addedAssignmentIds.length > 0) {
            await tx.insert(humanInterviewRoundInterviewer).values(
              addedAssignmentIds.map((userId) => ({
                confirmedAt: now,
                confirmedScheduleVersion: nextScheduleVersion,
                organizationId,
                roundId,
                status: "confirmed" as const,
                userId,
              })),
            );
          }
        }
      }
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
