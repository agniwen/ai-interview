import { and, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { meetingRecordingAsset, meetingSession } from "@arc/db-schema/schema";
import type {
  CreateMultipartSavedMeetingInput,
  CreateSmallSavedMeetingInput,
} from "@arc/shared/meeting-recording";
import { formatDefaultMeetingTitle } from "@arc/shared/utils/time";
import { rebuildMeetingSearchProjection } from "./routes/search/dao";

type NewMeetingAsset = (
  | (CreateSmallSavedMeetingInput["assets"][number] & {
      multipartParts?: null;
      uploadMode?: "single";
    })
  | (CreateMultipartSavedMeetingInput["assets"][number] & {
      multipartParts: CreateMultipartSavedMeetingInput["assets"][number]["parts"];
      uploadMode: "multipart";
    })
) & { storageKey: string };

const DIRECT_UPLOAD_CAPACITY_LOCK = "meeting-direct-upload-capacity";
const DIRECT_UPLOAD_LEASE_MS = 121 * 60 * 1000;

type MeetingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function meetingDirectUploadLeaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DIRECT_UPLOAD_LEASE_MS);
}

export async function lockMeetingDirectUploadCapacity(tx: MeetingTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${DIRECT_UPLOAD_CAPACITY_LOCK}))`);
}

export function resolveMeetingDirectUploadConcurrency(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number.parseInt(env.MEETING_DIRECT_UPLOAD_CONCURRENCY ?? "100", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

export async function hasMeetingDirectUploadCapacity(
  tx: MeetingTransaction,
  input: { excludeMeetingId: string; now: Date },
): Promise<boolean> {
  const [active] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(meetingSession)
    .where(
      and(
        gt(meetingSession.uploadLeaseExpiresAt, input.now),
        ne(meetingSession.id, input.excludeMeetingId),
      ),
    );
  return (active?.count ?? 0) < resolveMeetingDirectUploadConcurrency();
}

export function renewMeetingDirectUploadLease(input: {
  meetingId: string;
  organizationId: string;
  ownerId: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockMeetingDirectUploadCapacity(tx);
    const now = new Date();
    const [meeting] = await tx
      .select({ uploadLeaseExpiresAt: meetingSession.uploadLeaseExpiresAt })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
          eq(meetingSession.status, "uploading"),
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting) {
      return false;
    }
    if (
      !(meeting.uploadLeaseExpiresAt && meeting.uploadLeaseExpiresAt > now) &&
      !(await hasMeetingDirectUploadCapacity(tx, { excludeMeetingId: input.meetingId, now }))
    ) {
      return false;
    }
    const renewed = await tx
      .update(meetingSession)
      .set({ uploadLeaseExpiresAt: meetingDirectUploadLeaseExpiresAt(now) })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.ownerId, input.ownerId),
          eq(meetingSession.status, "uploading"),
        ),
      )
      .returning({ id: meetingSession.id });
    return renewed.length > 0;
  });
}

function defaultMeetingTitle(startedAt: string): string {
  return formatDefaultMeetingTitle(startedAt);
}

function loadMeetingSession(id: string) {
  return db.query.meetingSession.findFirst({ where: { id }, with: { assets: true } });
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.meeting.id}))`);
    const tombstone = await tx.query.meetingPurgeTombstone.findFirst({
      columns: { meetingId: true },
      where: { meetingId: input.meeting.id },
    });
    if (tombstone) {
      return "purged" as const;
    }
    const existing = await tx.query.meetingSession.findFirst({
      columns: {
        manifestSha256: true,
        organizationId: true,
        ownerId: true,
        status: true,
        uploadLeaseExpiresAt: true,
      },
      where: { id: input.meeting.id },
    });
    const now = new Date();
    if (existing) {
      if (
        existing.organizationId !== input.meeting.organizationId ||
        existing.ownerId !== input.meeting.ownerId ||
        existing.manifestSha256 !== input.meeting.manifestSha256 ||
        existing.status !== "uploading"
      ) {
        return false as const;
      }
      if (existing.uploadLeaseExpiresAt && existing.uploadLeaseExpiresAt > now) {
        await lockMeetingDirectUploadCapacity(tx);
        const renewalNow = new Date();
        const renewed = await tx
          .update(meetingSession)
          .set({ uploadLeaseExpiresAt: meetingDirectUploadLeaseExpiresAt(renewalNow) })
          .where(
            and(
              eq(meetingSession.id, input.meeting.id),
              gt(meetingSession.uploadLeaseExpiresAt, renewalNow),
            ),
          )
          .returning({ id: meetingSession.id });
        if (renewed.length > 0) {
          return false as const;
        }
      }
      await lockMeetingDirectUploadCapacity(tx);
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(meetingSession)
        .where(
          and(
            gt(meetingSession.uploadLeaseExpiresAt, now),
            ne(meetingSession.id, input.meeting.id),
          ),
        );
      if ((active?.count ?? 0) >= resolveMeetingDirectUploadConcurrency()) {
        return "capacity" as const;
      }
      await tx
        .update(meetingSession)
        .set({ uploadLeaseExpiresAt: meetingDirectUploadLeaseExpiresAt(now) })
        .where(eq(meetingSession.id, input.meeting.id));
      return false as const;
    }
    await lockMeetingDirectUploadCapacity(tx);
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(meetingSession)
      .where(gt(meetingSession.uploadLeaseExpiresAt, now));
    if ((active?.count ?? 0) >= resolveMeetingDirectUploadConcurrency()) {
      return "capacity" as const;
    }
    const inserted = await tx
      .insert(meetingSession)
      .values({
        id: input.meeting.id,
        liveTranscriptDraft: input.meeting.liveTranscriptDraft ?? null,
        manifestSha256: input.meeting.manifestSha256,
        organizationId: input.meeting.organizationId,
        ownerId: input.meeting.ownerId,
        savedAt: new Date(input.meeting.savedAt),
        startedAt: new Date(input.meeting.startedAt),
        status: "uploading",
        title: defaultMeetingTitle(input.meeting.startedAt),
        uploadLeaseExpiresAt: meetingDirectUploadLeaseExpiresAt(now),
      })
      .onConflictDoNothing({ target: meetingSession.id })
      .returning({ id: meetingSession.id });
    if (inserted.length === 0) {
      return false as const;
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
    await rebuildMeetingSearchProjection(tx, {
      meetingId: input.meeting.id,
      organizationId: input.meeting.organizationId,
    });
    return true as const;
  });
  return {
    blockedByCapacity: created === "capacity",
    blockedByPurge: created === "purged",
    created: created === true,
    meeting:
      created === "purged" || created === "capacity"
        ? undefined
        : await loadMeetingSession(input.meeting.id),
  };
}
