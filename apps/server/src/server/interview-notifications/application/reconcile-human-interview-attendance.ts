import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import { humanInterviewParticipantPresence } from "@app/shared/human-interview-attendance";
import { and, asc, eq, gt, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "../../../lib/server/db/index";
import type { Transaction } from "../dao";
import { cancelPendingHumanMeetingReminders, enqueueHumanMeetingEvents } from "../utils/events";

const ATTENDANCE_GRACE_PERIOD_MS = 3 * 60 * 1000;
const RECONCILIATION_LIMIT = 50;

async function loadAttendance(tx: Transaction, meetingId: string) {
  const [candidateRows, interviewerRows] = await Promise.all([
    tx
      .select({
        joinedAt: humanInterviewMeetingRound.joinedAt,
        leftAt: humanInterviewMeetingRound.leftAt,
        name: recruitingRecordReadModel.candidateName,
      })
      .from(humanInterviewMeetingRound)
      .innerJoin(
        humanInterviewRound,
        eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
      )
      .innerJoin(
        recruitingRecordReadModel,
        eq(recruitingRecordReadModel.id, humanInterviewRound.recruitingRecordId),
      )
      .where(eq(humanInterviewMeetingRound.meetingId, meetingId)),
    tx
      .select({
        joinedAt: humanInterviewMeetingInterviewer.joinedAt,
        leftAt: humanInterviewMeetingInterviewer.leftAt,
        name: user.name,
      })
      .from(humanInterviewMeetingInterviewer)
      .innerJoin(user, eq(user.id, humanInterviewMeetingInterviewer.userId))
      .where(
        and(
          eq(humanInterviewMeetingInterviewer.meetingId, meetingId),
          ne(humanInterviewMeetingInterviewer.role, "observer"),
        ),
      ),
  ]);
  const missingCandidates = candidateRows
    .filter((candidate) => humanInterviewParticipantPresence(candidate) !== "present")
    .map((candidate) => candidate.name);
  const missingInterviewers = interviewerRows
    .filter((interviewer) => humanInterviewParticipantPresence(interviewer) !== "present")
    .map((interviewer) => interviewer.name ?? "未命名面试官");
  const candidatePresent = candidateRows.some(
    (candidate) => humanInterviewParticipantPresence(candidate) === "present",
  );
  const interviewerPresent = interviewerRows.some(
    (interviewer) => humanInterviewParticipantPresence(interviewer) === "present",
  );
  return {
    allRequiredPresent:
      candidateRows.length > 0 &&
      interviewerRows.length > 0 &&
      missingCandidates.length === 0 &&
      missingInterviewers.length === 0,
    meetingEstablished: candidatePresent && interviewerPresent,
    missingCandidates,
    missingInterviewers,
    missingParticipantNames: [...missingCandidates, ...missingInterviewers],
  };
}

function attendanceStatus(input: {
  missingCandidates: string[];
  missingInterviewers: string[];
}): string {
  if (input.missingCandidates.length > 0 && input.missingInterviewers.length > 0) {
    return "候选人与面试官均未入会";
  }
  return input.missingCandidates.length > 0 ? "候选人未入会" : "面试官未入会";
}

async function markEstablished(tx: Transaction, meetingId: string, now: Date): Promise<void> {
  await tx
    .update(humanInterviewMeeting)
    .set({ establishedAt: now, updatedAt: now })
    .where(
      and(eq(humanInterviewMeeting.id, meetingId), isNull(humanInterviewMeeting.establishedAt)),
    );
}

function reconcileExpiredMeeting(meetingId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, meetingId))
      .for("update")
      .limit(1);
    if (
      !meeting ||
      meeting.establishedAt ||
      !meeting.validUntil ||
      meeting.validUntil.getTime() > now.getTime() ||
      !["scheduled", "in_progress"].includes(meeting.status)
    ) {
      return false;
    }
    const attendance = await loadAttendance(tx, meeting.id);
    if (attendance.meetingEstablished) {
      await markEstablished(tx, meeting.id, now);
      return false;
    }
    await tx
      .update(humanInterviewMeeting)
      .set({
        endedAt: meeting.endedAt ?? meeting.validUntil,
        lifecycleOccurredAt: now,
        lifecycleSource: "manual",
        status: "not_held",
        updatedAt: now,
      })
      .where(eq(humanInterviewMeeting.id, meeting.id));
    await cancelPendingHumanMeetingReminders(tx, meeting.id);
    await enqueueHumanMeetingEvents(tx, {
      actorUserId: null,
      attendanceStatus: "未召开",
      dedupeDiscriminator: "not-held",
      meetingId: meeting.id,
      missingParticipantNames: attendance.missingParticipantNames,
      now,
      scheduleVersion: meeting.scheduleVersion,
      suggestedAction: "请联系候选人与面试官确认情况，并在招聘系统中安排后续处理。",
      type: "human_interview_not_held",
    });
    return true;
  });
}

function reconcileLateMeeting(meetingId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, meetingId))
      .for("update")
      .limit(1);
    if (
      !meeting ||
      meeting.attendanceAlertedAt ||
      !meeting.scheduledAt ||
      meeting.scheduledAt.getTime() + ATTENDANCE_GRACE_PERIOD_MS > now.getTime() ||
      (meeting.validUntil && meeting.validUntil.getTime() <= now.getTime()) ||
      !["scheduled", "in_progress"].includes(meeting.status)
    ) {
      return false;
    }
    const attendance = await loadAttendance(tx, meeting.id);
    if (attendance.allRequiredPresent) {
      if (!meeting.establishedAt) {
        await markEstablished(tx, meeting.id, now);
      }
      return false;
    }
    if (!meeting.establishedAt && attendance.meetingEstablished) {
      await markEstablished(tx, meeting.id, now);
    }
    await tx
      .update(humanInterviewMeeting)
      .set({ attendanceAlertedAt: now, updatedAt: now })
      .where(eq(humanInterviewMeeting.id, meeting.id));
    await enqueueHumanMeetingEvents(tx, {
      actorUserId: null,
      attendanceStatus: attendanceStatus(attendance),
      dedupeDiscriminator: "attendance-alert",
      meetingId: meeting.id,
      missingParticipantNames: attendance.missingParticipantNames,
      now,
      scheduleVersion: meeting.scheduleVersion,
      suggestedAction: "请及时联系未入会人员，并前往招聘系统查看实时参会状态。",
      type: "human_interview_attendance_alert",
    });
    return true;
  });
}

export async function reconcileDueHumanInterviewAttendance({
  limit = RECONCILIATION_LIMIT,
  now = new Date(),
}: {
  limit?: number;
  now?: Date;
} = {}): Promise<{ alerted: number; notHeld: number }> {
  const expired = await db
    .select({ id: humanInterviewMeeting.id })
    .from(humanInterviewMeeting)
    .where(
      and(
        inArray(humanInterviewMeeting.status, ["scheduled", "in_progress"]),
        isNull(humanInterviewMeeting.establishedAt),
        lte(humanInterviewMeeting.validUntil, now),
      ),
    )
    .orderBy(asc(humanInterviewMeeting.validUntil))
    .limit(limit);
  let notHeld = 0;
  for (const meeting of expired) {
    if (await reconcileExpiredMeeting(meeting.id, now)) {
      notHeld += 1;
    }
  }

  const remaining = Math.max(0, limit - expired.length);
  if (remaining === 0) {
    return { alerted: 0, notHeld };
  }
  const graceThreshold = new Date(now.getTime() - ATTENDANCE_GRACE_PERIOD_MS);
  const late = await db
    .select({ id: humanInterviewMeeting.id })
    .from(humanInterviewMeeting)
    .where(
      and(
        inArray(humanInterviewMeeting.status, ["scheduled", "in_progress"]),
        isNull(humanInterviewMeeting.attendanceAlertedAt),
        lte(humanInterviewMeeting.scheduledAt, graceThreshold),
        gt(humanInterviewMeeting.validUntil, now),
      ),
    )
    .orderBy(asc(humanInterviewMeeting.scheduledAt))
    .limit(remaining);
  let alerted = 0;
  for (const meeting of late) {
    if (await reconcileLateMeeting(meeting.id, now)) {
      alerted += 1;
    }
  }
  return { alerted, notHeld };
}
