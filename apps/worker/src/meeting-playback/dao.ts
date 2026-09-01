import { and, eq, inArray, or } from "drizzle-orm";
import {
  meetingRecordingAsset,
  meetingSession,
  meetingStorageCleanupKey,
} from "@arc/db-schema/schema";
import { db } from "../db";

const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

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

export async function registerMeetingPlaybackCleanupKey(input: {
  meetingId: string;
  organizationId: string;
  processingRunId: string;
  storageKey: string;
}): Promise<{ writerLeaseExpiresAt: Date } | null> {
  const writerLeaseExpiresAt = new Date(Date.now() + 12 * 60 * 1000);
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({ id: meetingSession.id })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.processingRunId, input.processingRunId),
          eq(meetingSession.status, "processing"),
        ),
      )
      .for("share")
      .limit(1);
    if (!meeting) {
      return null;
    }
    await tx
      .insert(meetingStorageCleanupKey)
      .values({
        meetingId: input.meetingId,
        organizationId: input.organizationId,
        storageKey: input.storageKey,
        writerLeaseExpiresAt,
      })
      .onConflictDoUpdate({
        set: {
          finalSweepCompletedAt: null,
          initialSweepCompletedAt: null,
          writerLeaseExpiresAt,
        },
        target: meetingStorageCleanupKey.storageKey,
      });
    return { writerLeaseExpiresAt };
  });
}

export async function removeMeetingPlaybackCleanupKey(input: {
  meetingId: string;
  organizationId: string;
  storageKey: string;
}): Promise<void> {
  await db
    .delete(meetingStorageCleanupKey)
    .where(
      and(
        eq(meetingStorageCleanupKey.meetingId, input.meetingId),
        eq(meetingStorageCleanupKey.organizationId, input.organizationId),
        eq(meetingStorageCleanupKey.storageKey, input.storageKey),
      ),
    );
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
