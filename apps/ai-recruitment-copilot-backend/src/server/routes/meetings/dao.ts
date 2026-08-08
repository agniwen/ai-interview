import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { meetingRecordingAsset, meetingSession } from "@arc/db-schema/schema";
import type { CreateSmallSavedMeetingInput } from "@arc/shared/meeting-recording";

export type NewMeetingAsset = CreateSmallSavedMeetingInput["assets"][number] & {
  storageKey: string;
};

export function loadMeetingSession(id: string) {
  return db.query.meetingSession.findFirst({
    where: { id },
    with: { assets: true },
  });
}

export async function createOrLoadMeetingSession(input: {
  assets: NewMeetingAsset[];
  meeting: Omit<CreateSmallSavedMeetingInput, "assets" | "id"> & {
    id: string;
    organizationId: string;
    ownerId: string;
  };
}) {
  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(meetingSession)
      .values({
        id: input.meeting.id,
        manifestSha256: input.meeting.manifestSha256,
        organizationId: input.meeting.organizationId,
        ownerId: input.meeting.ownerId,
        savedAt: new Date(input.meeting.savedAt),
        startedAt: new Date(input.meeting.startedAt),
        status: "uploading",
      })
      .onConflictDoNothing({ target: meetingSession.id })
      .returning({ id: meetingSession.id });
    if (inserted.length === 0) {
      return false;
    }
    await tx.insert(meetingRecordingAsset).values(
      input.assets.map((asset) => ({
        contentType: asset.contentType,
        durationMs: asset.durationMs,
        fragmentCount: asset.fragmentCount,
        id: `${input.meeting.id}:${asset.track}`,
        meetingId: input.meeting.id,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        status: "uploading",
        storageKey: asset.storageKey,
        track: asset.track,
      })),
    );
    return true;
  });
  return { created, meeting: await loadMeetingSession(input.meeting.id) };
}

export async function markMeetingSessionVerified(input: {
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<void> {
  const verifiedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(meetingRecordingAsset)
      .set({ status: "ready", verifiedAt })
      .where(eq(meetingRecordingAsset.meetingId, input.meetingId));
    await tx
      .update(meetingSession)
      .set({ status: "workspace-verified", verifiedAt })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
        ),
      );
  });
}
