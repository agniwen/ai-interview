import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import { meetingLiveTranscriptLease } from "@app/db-schema/schema";
import type { MeetingLiveTranscriptTrack } from "@app/shared/meeting-transcription";
import { resolveMeetingLiveTranscriptConcurrency } from "./authorization-gate";

const LIVE_TRANSCRIPT_CAPACITY_LOCK = "meeting-live-transcript-capacity";
const LIVE_TRANSCRIPT_LEASE_MS = 90_000;

interface LiveTranscriptLeaseIdentity {
  captureId: string;
  organizationId: string;
  userId: string;
}

interface LiveTranscriptTrackLeaseIdentity extends LiveTranscriptLeaseIdentity {
  track: MeetingLiveTranscriptTrack;
}

export function claimMeetingLiveTranscriptLease(
  input: LiveTranscriptTrackLeaseIdentity,
): Promise<"capacity" | "created" | "renewed"> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${LIVE_TRANSCRIPT_CAPACITY_LOCK}))`);
    const now = new Date();
    const existing = await tx.query.meetingLiveTranscriptLease.findFirst({
      where: {
        captureId: input.captureId,
        organizationId: input.organizationId,
        track: input.track,
      },
    });
    if (existing?.userId === input.userId && existing.expiresAt > now) {
      await tx
        .update(meetingLiveTranscriptLease)
        .set({ expiresAt: new Date(now.getTime() + LIVE_TRANSCRIPT_LEASE_MS), updatedAt: now })
        .where(
          and(
            eq(meetingLiveTranscriptLease.captureId, input.captureId),
            eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
            eq(meetingLiveTranscriptLease.track, input.track),
          ),
        );
      return "renewed";
    }
    if (existing && existing.expiresAt > now) {
      return "capacity";
    }
    const [activeCapture] = await tx
      .select({ userId: meetingLiveTranscriptLease.userId })
      .from(meetingLiveTranscriptLease)
      .where(
        and(
          eq(meetingLiveTranscriptLease.captureId, input.captureId),
          eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
          gt(meetingLiveTranscriptLease.expiresAt, now),
        ),
      )
      .limit(1);
    if (activeCapture && activeCapture.userId !== input.userId) {
      return "capacity";
    }
    if (!activeCapture) {
      const [active] = await tx
        .select({
          count: sql<number>`count(distinct (${meetingLiveTranscriptLease.organizationId}, ${meetingLiveTranscriptLease.captureId}))::int`,
        })
        .from(meetingLiveTranscriptLease)
        .where(gt(meetingLiveTranscriptLease.expiresAt, now));
      if ((active?.count ?? 0) >= resolveMeetingLiveTranscriptConcurrency()) {
        return "capacity";
      }
    }
    await tx
      .insert(meetingLiveTranscriptLease)
      .values({
        captureId: input.captureId,
        expiresAt: new Date(now.getTime() + LIVE_TRANSCRIPT_LEASE_MS),
        organizationId: input.organizationId,
        track: input.track,
        updatedAt: now,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          expiresAt: new Date(now.getTime() + LIVE_TRANSCRIPT_LEASE_MS),
          updatedAt: now,
          userId: input.userId,
        },
        target: [
          meetingLiveTranscriptLease.organizationId,
          meetingLiveTranscriptLease.captureId,
          meetingLiveTranscriptLease.track,
        ],
      });
    return "created";
  });
}

export async function releaseMeetingLiveTranscriptTrackLease(
  input: LiveTranscriptTrackLeaseIdentity,
): Promise<void> {
  await db
    .delete(meetingLiveTranscriptLease)
    .where(
      and(
        eq(meetingLiveTranscriptLease.captureId, input.captureId),
        eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
        eq(meetingLiveTranscriptLease.track, input.track),
        eq(meetingLiveTranscriptLease.userId, input.userId),
      ),
    );
}

export function renewMeetingLiveTranscriptLease(
  input: LiveTranscriptLeaseIdentity,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${LIVE_TRANSCRIPT_CAPACITY_LOCK}))`);
    const now = new Date();
    const renewed = await tx
      .update(meetingLiveTranscriptLease)
      .set({ expiresAt: new Date(now.getTime() + LIVE_TRANSCRIPT_LEASE_MS), updatedAt: now })
      .where(
        and(
          eq(meetingLiveTranscriptLease.captureId, input.captureId),
          eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
          eq(meetingLiveTranscriptLease.userId, input.userId),
          gt(meetingLiveTranscriptLease.expiresAt, now),
        ),
      )
      .returning({ captureId: meetingLiveTranscriptLease.captureId });
    return renewed.length > 0;
  });
}

export async function releaseMeetingLiveTranscriptLease(
  input: LiveTranscriptLeaseIdentity,
): Promise<void> {
  await db
    .delete(meetingLiveTranscriptLease)
    .where(
      and(
        eq(meetingLiveTranscriptLease.captureId, input.captureId),
        eq(meetingLiveTranscriptLease.organizationId, input.organizationId),
        eq(meetingLiveTranscriptLease.userId, input.userId),
      ),
    );
}
