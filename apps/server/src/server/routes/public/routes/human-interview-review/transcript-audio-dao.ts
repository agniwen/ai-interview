import { meetingRecordingAsset } from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";

export async function findTranscriptAudioAsset(meetingId: string, sourceId: string) {
  const assets = await db
    .select()
    .from(meetingRecordingAsset)
    .where(
      and(
        eq(meetingRecordingAsset.meetingId, meetingId),
        eq(meetingRecordingAsset.status, "ready"),
      ),
    );
  return assets.find(
    (item) =>
      item.recordingIdentity?.sourceId === sourceId ||
      (!item.recordingIdentity && item.track === sourceId),
  );
}
