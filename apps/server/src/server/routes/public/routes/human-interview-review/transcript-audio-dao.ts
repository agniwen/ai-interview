import { humanInterviewMeeting, meetingRecordingAsset } from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";

export async function findTranscriptAudioAsset(
  meetingId: string,
  sourceId: string,
  interval?: { startMs: number; endMs: number },
) {
  const assets = await db
    .select()
    .from(meetingRecordingAsset)
    .where(
      and(
        eq(meetingRecordingAsset.meetingId, meetingId),
        eq(meetingRecordingAsset.status, "ready"),
      ),
    );
  const [humanMeeting] = await db
    .select({ tracks: humanInterviewMeeting.recordingTracks })
    .from(humanInterviewMeeting)
    .where(eq(humanInterviewMeeting.processingMeetingSessionId, meetingId));
  const matchedIds = new Set(
    humanMeeting?.tracks
      ?.filter((track) => track.trackId === sourceId && track.status === "completed")
      .map((track) => track.id),
  );
  return assets.find(
    (item) =>
      (!interval ||
        ((item.recordingIdentity?.offsetMs ?? 0) < interval.endMs &&
          (item.recordingIdentity?.offsetMs ?? 0) + item.durationMs > interval.startMs)) &&
      (item.recordingIdentity?.sourceId === sourceId ||
        (item.recordingIdentity && matchedIds.has(item.recordingIdentity.sourceId)) ||
        (!item.recordingIdentity && item.track === sourceId)),
  );
}
