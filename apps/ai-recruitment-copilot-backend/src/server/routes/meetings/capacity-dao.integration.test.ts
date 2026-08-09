import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { meetingSession, organization, user } from "@arc/db-schema/schema";
import { createFixtureNamespace } from "../../../test-utils/fixture-id";
import { withDatabaseAdvisoryTestLock } from "../../../test-utils/database-advisory-lock";
import {
  createOrLoadMeetingSession,
  markMeetingSessionVerified,
  renewMeetingDirectUploadLease,
} from "./dao";
import {
  claimMeetingLiveTranscriptLease,
  releaseMeetingLiveTranscriptLease,
  renewMeetingLiveTranscriptLease,
} from "./routes/live-transcript/dao";

const NS = createFixtureNamespace("meeting_capacity");
const ORGANIZATION_ID = `${NS}_org`;
const OWNER_ID = `${NS}_owner`;

const assets = (meetingId: string) =>
  (["microphone", "system"] as const).map((track, index) => ({
    contentType: "audio/webm;codecs=opus",
    durationMs: 60_000,
    fragmentCount: 1,
    sha256: String(index + 1).repeat(64),
    sizeBytes: 1024,
    storageKey: `${ORGANIZATION_ID}/${meetingId}/${track}.webm`,
    track,
  }));

const meeting = (id: string) => ({
  id,
  manifestSha256: "a".repeat(64),
  organizationId: ORGANIZATION_ID,
  ownerId: OWNER_ID,
  savedAt: "2026-08-09T09:00:00.000Z",
  startedAt: "2026-08-09T08:00:00.000Z",
});

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, OWNER_ID));
}

describe("Meeting capacity leases", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date();
    await db.insert(user).values({
      createdAt: now,
      email: `${OWNER_ID}@example.test`,
      emailVerified: true,
      id: OWNER_ID,
      name: "Meeting Capacity Owner",
      updatedAt: now,
    });
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Meeting Capacity Test",
      slug: `${NS}-org`,
    });
  }, 30_000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clean();
  }, 30_000);

  it("bounds new direct uploads while preserving idempotent recovery and freeing verified leases", async () => {
    await withDatabaseAdvisoryTestLock("meeting-direct-capacity-integration", async () => {
      const firstId = `${NS}_first`;
      const secondId = `${NS}_second`;
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1000000");
      await expect(
        createOrLoadMeetingSession({ assets: assets(firstId), meeting: meeting(firstId) }),
      ).resolves.toMatchObject({ blockedByCapacity: false, created: true });
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1");
      await expect(
        createOrLoadMeetingSession({ assets: assets(secondId), meeting: meeting(secondId) }),
      ).resolves.toMatchObject({ blockedByCapacity: true, created: false });
      await expect(
        createOrLoadMeetingSession({ assets: assets(firstId), meeting: meeting(firstId) }),
      ).resolves.toMatchObject({ blockedByCapacity: false, created: false });
      await expect(
        renewMeetingDirectUploadLease({
          meetingId: firstId,
          organizationId: ORGANIZATION_ID,
          ownerId: OWNER_ID,
        }),
      ).resolves.toBe(true);

      await db
        .update(meetingSession)
        .set({
          purgeAfter: new Date(Date.now() + 60_000),
          status: "trashed",
          trashedAt: new Date(),
          trashedFromStatus: "uploading",
        })
        .where(eq(meetingSession.id, firstId));
      await expect(
        createOrLoadMeetingSession({ assets: assets(secondId), meeting: meeting(secondId) }),
      ).resolves.toMatchObject({ blockedByCapacity: true, created: false });
      await db
        .update(meetingSession)
        .set({
          purgeAfter: null,
          status: "uploading",
          trashedAt: null,
          trashedFromStatus: null,
        })
        .where(eq(meetingSession.id, firstId));

      await db
        .update(meetingSession)
        .set({ uploadLeaseExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(meetingSession.id, firstId));
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1000000");
      await expect(
        createOrLoadMeetingSession({ assets: assets(secondId), meeting: meeting(secondId) }),
      ).resolves.toMatchObject({ blockedByCapacity: false, created: true });
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1");
      await expect(
        renewMeetingDirectUploadLease({
          meetingId: firstId,
          organizationId: ORGANIZATION_ID,
          ownerId: OWNER_ID,
        }),
      ).resolves.toBe(false);
      await markMeetingSessionVerified({
        meetingId: secondId,
        organizationId: ORGANIZATION_ID,
        ownerId: OWNER_ID,
      });
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1000000");
      await expect(
        renewMeetingDirectUploadLease({
          meetingId: firstId,
          organizationId: ORGANIZATION_ID,
          ownerId: OWNER_ID,
        }),
      ).resolves.toBe(true);
    });
  });

  it("counts one renewable live lease per capture and frees it explicitly", async () => {
    const first = {
      captureId: "00000000-0000-4000-8000-000000000085",
      organizationId: ORGANIZATION_ID,
      track: "microphone" as const,
      userId: OWNER_ID,
    };
    const firstSystem = { ...first, track: "system" as const };
    const second = { ...first, captureId: "00000000-0000-4000-8000-000000000086" };

    vi.stubEnv("MEETING_LIVE_TRANSCRIPT_CONCURRENCY", "1000000");
    await expect(claimMeetingLiveTranscriptLease(first)).resolves.toBe("created");
    vi.stubEnv("MEETING_LIVE_TRANSCRIPT_CONCURRENCY", "1");
    await expect(claimMeetingLiveTranscriptLease(first)).resolves.toBe("renewed");
    await expect(claimMeetingLiveTranscriptLease(firstSystem)).resolves.toBe("created");
    await expect(renewMeetingLiveTranscriptLease(first)).resolves.toBe(true);
    await expect(claimMeetingLiveTranscriptLease(second)).resolves.toBe("capacity");

    await releaseMeetingLiveTranscriptLease(first);
    vi.stubEnv("MEETING_LIVE_TRANSCRIPT_CONCURRENCY", "1000000");
    await expect(claimMeetingLiveTranscriptLease(second)).resolves.toBe("created");
  });
});
