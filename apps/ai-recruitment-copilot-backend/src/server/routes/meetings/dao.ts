import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { meetingRecordingAsset, meetingSession, user } from "@arc/db-schema/schema";
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

const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

function defaultMeetingTitle(startedAt: string): string {
  return `录制记录-${startedAt.slice(2, 16).replaceAll(/[-T:]/g, "")}`;
}

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
        title: defaultMeetingTitle(input.meeting.startedAt),
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
        processingError: null,
        processingRunId: null,
        recoveryCopyDeleteAfter: sql`coalesce(${meetingSession.recoveryCopyDeleteAfter}, ${recoveryCopyDeleteAfter})`,
        status: "processing",
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

export function listMeetingSessionsForAccess(input: {
  includeAllPrivateMeetings: boolean;
  organizationId: string;
  userId: string;
}) {
  const access = input.includeAllPrivateMeetings
    ? eq(meetingSession.organizationId, input.organizationId)
    : and(
        eq(meetingSession.organizationId, input.organizationId),
        eq(meetingSession.ownerId, input.userId),
      );
  return db
    .select({
      creatorId: user.id,
      creatorImage: user.image,
      creatorName: user.name,
      durationMs: sql<number>`coalesce(max(${meetingRecordingAsset.durationMs}) filter (where ${meetingRecordingAsset.track} in ('microphone', 'system')), 0)`,
      id: meetingSession.id,
      recordingAvailable: sql<boolean>`coalesce(bool_or(${meetingRecordingAsset.track} = 'playback' and ${meetingRecordingAsset.status} = 'ready'), false)`,
      savedAt: meetingSession.savedAt,
      status: meetingSession.status,
      title: meetingSession.title,
    })
    .from(meetingSession)
    .innerJoin(user, eq(user.id, meetingSession.ownerId))
    .leftJoin(meetingRecordingAsset, eq(meetingRecordingAsset.meetingId, meetingSession.id))
    .where(and(access, inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES])))
    .groupBy(
      meetingSession.id,
      meetingSession.title,
      meetingSession.savedAt,
      meetingSession.status,
      user.id,
      user.name,
      user.image,
    )
    .orderBy(desc(meetingSession.savedAt));
}

export function loadMeetingSessionForAccess(input: {
  includeAllPrivateMeetings: boolean;
  meetingId: string;
  organizationId: string;
  userId: string;
}) {
  return db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      ownerId: input.includeAllPrivateMeetings ? undefined : input.userId,
      status: { in: [...LIBRARY_MEETING_STATUSES] },
    },
    with: { assets: true, owner: true },
  });
}

export function loadMeetingPlaybackSource(input: { meetingId: string; organizationId: string }) {
  return db.query.meetingSession.findFirst({
    where: {
      id: input.meetingId,
      organizationId: input.organizationId,
      status: { in: [...LIBRARY_MEETING_STATUSES] },
    },
    with: { assets: true },
  });
}

export async function listRecoverableMeetingPlaybackJobs(): Promise<
  { meetingId: string; organizationId: string }[]
> {
  const jobs = await db
    .select({ meetingId: meetingSession.id, organizationId: meetingSession.organizationId })
    .from(meetingSession)
    .where(
      or(eq(meetingSession.status, "workspace-verified"), eq(meetingSession.status, "processing")),
    );
  return jobs;
}

export async function markMeetingPlaybackProcessing(input: {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingSession)
    .set({
      processingError: null,
      processingRunId: input.processingRunId,
      status: "processing",
    })
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        inArray(meetingSession.status, ["workspace-verified", "processing", "processing-failed"]),
      ),
    )
    .returning({ id: meetingSession.id });
  return updated.length > 0;
}

export async function markMeetingPlaybackFailed(input: {
  errorMessage: string;
  meetingId: string;
  organizationId: string;
  processingRunId: string;
}): Promise<boolean> {
  const updated = await db
    .update(meetingSession)
    .set({
      processingError: input.errorMessage.slice(0, 1000),
      processingRunId: null,
      status: "processing-failed",
    })
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
        eq(meetingSession.processingRunId, input.processingRunId),
        eq(meetingSession.status, "processing"),
      ),
    )
    .returning({ id: meetingSession.id });
  return updated.length > 0;
}

export async function publishMeetingPlaybackAsset(input: {
  contentType: string;
  durationMs: number;
  meetingId: string;
  organizationId: string;
  processingRunId: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}): Promise<boolean> {
  const verifiedAt = new Date();
  return await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(meetingSession)
      .set({ processingError: null, processingRunId: null, status: "ready" })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.processingRunId, input.processingRunId),
          eq(meetingSession.status, "processing"),
        ),
      )
      .returning({ id: meetingSession.id });
    if (!claimed) {
      return false;
    }
    await tx
      .insert(meetingRecordingAsset)
      .values({
        contentType: input.contentType,
        durationMs: input.durationMs,
        fragmentCount: 0,
        id: `${input.meetingId}:playback`,
        meetingId: input.meetingId,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        status: "ready",
        storageKey: input.storageKey,
        track: "playback",
        uploadMode: "derived",
        verifiedAt,
      })
      .onConflictDoUpdate({
        set: {
          contentType: input.contentType,
          durationMs: input.durationMs,
          sha256: input.sha256,
          sizeBytes: input.sizeBytes,
          status: "ready",
          storageKey: input.storageKey,
          uploadMode: "derived",
          verifiedAt,
        },
        target: [meetingRecordingAsset.meetingId, meetingRecordingAsset.track],
      });
    return true;
  });
}
