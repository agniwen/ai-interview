import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { meetingRecordingAsset, meetingSession } from "@arc/db-schema/schema";
import type {
  CreateMultipartSavedMeetingInput,
  CreateSmallSavedMeetingInput,
} from "@arc/shared/meeting-recording";

export type NewMeetingAsset = (
  | (CreateSmallSavedMeetingInput["assets"][number] & {
      multipartParts?: null;
      uploadMode?: "single";
    })
  | (CreateMultipartSavedMeetingInput["assets"][number] & {
      multipartParts: CreateMultipartSavedMeetingInput["assets"][number]["parts"];
      uploadMode: "multipart";
    })
) & {
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
        multipartParts: asset.multipartParts ?? null,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        status: "uploading",
        storageKey: asset.storageKey,
        track: asset.track,
        uploadMode: asset.uploadMode ?? "single",
      })),
    );
    return true;
  });
  return { created, meeting: await loadMeetingSession(input.meeting.id) };
}

export async function recordMeetingAssetMultipartUploadId(input: {
  assetId: string;
  uploadId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingRecordingAsset)
    .set({ multipartUploadId: input.uploadId })
    .where(
      and(
        eq(meetingRecordingAsset.id, input.assetId),
        isNull(meetingRecordingAsset.multipartUploadId),
      ),
    )
    .returning({ id: meetingRecordingAsset.id });
  return updated.length > 0;
}

export async function markMeetingSessionVerified(input: {
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<Date> {
  const verifiedAt = new Date();
  const recoveryCopyDeleteAfter = new Date(verifiedAt.getTime() + 24 * 60 * 60 * 1000);
  const persistedDeadline = await db.transaction(async (tx) => {
    await tx
      .update(meetingRecordingAsset)
      .set({ status: "ready", verifiedAt })
      .where(eq(meetingRecordingAsset.meetingId, input.meetingId));
    const [updated] = await tx
      .update(meetingSession)
      .set({
        recoveryCopyDeleteAfter: sql`coalesce(${meetingSession.recoveryCopyDeleteAfter}, ${recoveryCopyDeleteAfter})`,
        status: "workspace-verified",
        verifiedAt,
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
        ),
      )
      .returning({ recoveryCopyDeleteAfter: meetingSession.recoveryCopyDeleteAfter });
    return updated?.recoveryCopyDeleteAfter;
  });
  if (!persistedDeadline) {
    throw new Error("Meeting Session 验证状态未能持久化");
  }
  return persistedDeadline;
}
