import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
} from "@app/db-schema/schema";
import type { HumanInterviewRecordingTrack } from "@app/db-schema/human-interview-recording";
import { db } from "../../../../../../lib/server/db/index";

export async function loadTrackRecordingScope(roomName: string) {
  const [meeting] = await db
    .select()
    .from(humanInterviewMeeting)
    .where(eq(humanInterviewMeeting.liveKitRoomName, roomName))
    .limit(1);
  if (!meeting) {
    return null;
  }
  const [rounds, interviewers] = await Promise.all([
    db
      .select({
        name: recruitingRecordReadModel.candidateName,
        roundId: humanInterviewMeetingRound.roundId,
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
      .where(eq(humanInterviewMeetingRound.meetingId, meeting.id)),
    db
      .select({
        role: humanInterviewMeetingInterviewer.role,
        userId: humanInterviewMeetingInterviewer.userId,
      })
      .from(humanInterviewMeetingInterviewer)
      .where(eq(humanInterviewMeetingInterviewer.meetingId, meeting.id)),
  ]);
  return {
    meeting,
    participants: [
      ...rounds.map((round) => ({
        identity: `candidate_${round.roundId}`,
        name: `候选人 · ${round.name}`,
        role: "candidate" as const,
      })),
      ...interviewers
        .filter((person) => person.role !== "observer")
        .map((person) => ({
          identity: `interviewer_${person.userId}`,
          name: "面试官",
          role: "interviewer" as const,
        })),
    ],
  };
}

export async function claimTrackRecordings(input: {
  meetingId: string;
  organizationId: string;
  proposed: HumanInterviewRecordingTrack[];
}): Promise<HumanInterviewRecordingTrack[]> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.id, input.meetingId),
          eq(humanInterviewMeeting.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting || !["scheduled", "in_progress"].includes(meeting.status)) {
      return [];
    }
    // Existing legacy recordings continue through their original completion path.
    if (!meeting.recordingTracks && meeting.recordingEgressId) {
      return [];
    }
    const existing = meeting.recordingTracks ?? [];
    const claimed = input.proposed.filter((track) => {
      const attempts = existing.filter((item) => item.trackId === track.trackId);
      return attempts.length < 3 && !attempts.some((item) => item.status !== "failed");
    });
    if (claimed.length > 0) {
      await tx
        .update(humanInterviewMeeting)
        .set({
          recordingStatus: existing.length ? meeting.recordingStatus : "starting",
          recordingTracks: [...existing, ...claimed],
          updatedAt: new Date(),
        })
        .where(eq(humanInterviewMeeting.id, meeting.id));
    }
    return claimed;
  });
}

export async function updateTrackRecording(input: {
  meetingId: string;
  id: string;
  patch: Partial<HumanInterviewRecordingTrack>;
}): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, input.meetingId))
      .for("update")
      .limit(1);
    if (!meeting?.recordingTracks) {
      return false;
    }
    const tracks = meeting.recordingTracks.map((track) => {
      if (track.id !== input.id) {
        return track;
      }
      if (input.patch.unpublishedAtMs) {
        return { ...track, unpublishedAtMs: track.unpublishedAtMs ?? input.patch.unpublishedAtMs };
      }
      if (track.status === "completed") {
        return track;
      }
      if (track.status === "failed" && input.patch.status !== "completed") {
        return track;
      }
      return { ...track, ...input.patch, updatedAtMs: Date.now() };
    });
    const room = tracks.findLast((track) => track.role === "mixed");
    const candidate = tracks.findLast((track) => track.role === "candidate");
    const patch: Partial<typeof humanInterviewMeeting.$inferInsert> = {
      recordingTracks: tracks,
      updatedAt: new Date(),
    };
    if (room) {
      Object.assign(patch, {
        recordingDurationMs: room.durationMs || null,
        recordingEgressId: room.egressId,
        recordingError: meeting.processingMeetingSessionId ? meeting.recordingError : room.error,
        recordingFileKey: room.fileKey,
        recordingSizeBytes: room.sizeBytes || null,
        recordingStatus: room.status,
      });
    }
    if (candidate) {
      Object.assign(patch, {
        candidateRecordingDurationMs: candidate.durationMs || null,
        candidateRecordingEgressId: candidate.egressId,
        candidateRecordingError: candidate.error,
        candidateRecordingFileKey: candidate.fileKey,
        candidateRecordingSizeBytes: candidate.sizeBytes || null,
        candidateRecordingStatus: candidate.status,
      });
    }
    await tx
      .update(humanInterviewMeeting)
      .set(patch)
      .where(eq(humanInterviewMeeting.id, meeting.id));
    return ["scheduled", "in_progress"].includes(meeting.status);
  });
}

export async function listTrackRecordingMeetings() {
  return await db
    .select({ roomName: humanInterviewMeeting.liveKitRoomName })
    .from(humanInterviewMeeting)
    .where(
      and(
        isNotNull(humanInterviewMeeting.recordingTracks),
        isNull(humanInterviewMeeting.processingMeetingSessionId),
        inArray(humanInterviewMeeting.status, ["in_progress", "ended"]),
      ),
    );
}
