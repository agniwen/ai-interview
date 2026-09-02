/* oxlint-disable max-lines -- lifecycle integration scenarios share one expensive database fixture. */
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@server/lib/server/db/index";
import {
  meetingAccessGrant,
  meetingAuditLog,
  meetingIntelligenceRevision,
  meetingNote,
  meetingProcessingRun,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingRecruitingContext,
  meetingRecordingAsset,
  meetingSearchProjection,
  meetingSession,
  meetingStorageCleanupKey,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  meetingTranscriptionPolicy,
  member,
  organization,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import { createOrLoadMeetingSession, loadMeetingSessionForAccess } from "./dao";
import { withDatabaseAdvisoryTestLock } from "../../../test-utils/database-advisory-lock";
import { listMeetingQuestionThreads } from "./answers/dao";
import { publishMeetingTranscript } from "./transcription/dao";
import {
  claimMeetingPurge,
  completeMeetingPurgeStorageBatch,
  finalizeMeetingPurge,
  loadMeetingLocalRecoveryDirective,
  recordMeetingLocalRecoveryCleanup,
  recordMeetingProviderPurgeOutcome,
  releaseMeetingPurgeClaim,
  requestMeetingPurge,
  restoreMeetingSession,
  trashMeetingSession,
} from "./lifecycle-dao";

const SUFFIX = String(process.pid);
const ORGANIZATION_ID = `meeting_lifecycle_org_${SUFFIX}`;
const OWNER_ID = `meeting_lifecycle_owner_${SUFFIX}`;
const EDITOR_ID = `meeting_lifecycle_editor_${SUFFIX}`;
const MEETING_ID = `meeting_lifecycle_meeting_${SUFFIX}`;
const CANDIDATE_ID = `meeting_lifecycle_candidate_${SUFFIX}`;
const FINAL_RUN_ID = `meeting_lifecycle_final_run_${SUFFIX}`;
const INTELLIGENCE_RUN_ID = `meeting_lifecycle_intelligence_run_${SUFFIX}`;
const TRANSCRIPT_ID = `meeting_lifecycle_transcript_${SUFFIX}`;
const INTELLIGENCE_ID = `meeting_lifecycle_intelligence_${SUFFIX}`;
const TEST_EPOCH_MS = Date.now() + 24 * 60 * 60 * 1000;
const testTime = (offsetMs = 0) => new Date(TEST_EPOCH_MS + offsetMs);

async function clean() {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(inArray(user.id, [OWNER_ID, EDITOR_ID]));
}

describe("Meeting lifecycle DAO", () => {
  beforeEach(async () => {
    await clean();
    const now = testTime();
    await db.insert(user).values(
      [OWNER_ID, EDITOR_ID].map((id) => ({
        createdAt: now,
        email: `${id}@example.test`,
        emailVerified: true,
        id,
        name: id,
        updatedAt: now,
      })),
    );
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Meeting lifecycle test",
      slug: `meeting-lifecycle-${SUFFIX}`,
    });
    await db.insert(member).values([
      {
        createdAt: now,
        id: `${OWNER_ID}_member`,
        organizationId: ORGANIZATION_ID,
        role: "member",
        userId: OWNER_ID,
      },
      {
        createdAt: now,
        id: `${EDITOR_ID}_member`,
        organizationId: ORGANIZATION_ID,
        role: "member",
        userId: EDITOR_ID,
      },
    ]);
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORGANIZATION_ID,
      ownerId: OWNER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Meeting lifecycle",
      transcriptionStatus: "ready",
      visibility: "workspace",
    });
    await db.insert(meetingAccessGrant).values({
      createdBy: OWNER_ID,
      id: `meeting_lifecycle_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId: `${EDITOR_ID}_member`,
      organizationId: ORGANIZATION_ID,
      role: "editor",
    });
    await db.insert(meetingRecordingAsset).values(
      (["microphone", "system", "playback"] as const).map((track, index) => ({
        contentType: "audio/webm",
        durationMs: 60_000,
        fragmentCount: 1,
        id: `meeting_lifecycle_asset_${track}_${SUFFIX}`,
        meetingId: MEETING_ID,
        sha256: String(index + 1).repeat(64),
        sizeBytes: 1024,
        status: "ready",
        storageKey: `meeting-lifecycle/${SUFFIX}/${track}.webm`,
        track,
        verifiedAt: now,
      })),
    );
    await db.insert(meetingNote).values({
      authorId: OWNER_ID,
      authorName: OWNER_ID,
      body: "Lifecycle note",
      id: `meeting_lifecycle_note_${SUFFIX}`,
      meetingId: MEETING_ID,
      meetingTimeMs: 1000,
      organizationId: ORGANIZATION_ID,
    });
    await db.insert(meetingSearchProjection).values({
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      searchText: "private lifecycle transcript",
    });
    await db.insert(studioInterview).values({
      candidateName: "Lifecycle Candidate",
      createdAt: now,
      createdBy: OWNER_ID,
      id: CANDIDATE_ID,
      organizationId: ORGANIZATION_ID,
      updatedAt: now,
    });
    await db.insert(meetingRecruitingContext).values({
      linkedBy: OWNER_ID,
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      recruitingRecordId: CANDIDATE_ID,
    });
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      finishedAt: now,
      id: FINAL_RUN_ID,
      idempotencyKey: `meeting-lifecycle-final-${SUFFIX}`,
      meetingId: MEETING_ID,
      model: "whisper-1",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
      provider: "openai",
      region: "global",
      stage: "final-transcription",
      status: "succeeded",
    });
    await db.insert(meetingTranscriptionPolicy).values({
      allowedProviders: ["openai"],
      organizationId: ORGANIZATION_ID,
      revision: 1,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
      updatedBy: OWNER_ID,
    });
    await db.insert(meetingTranscriptRevision).values({
      id: TRANSCRIPT_ID,
      kind: "final",
      meetingId: MEETING_ID,
      model: "whisper-1",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
      processingRunId: FINAL_RUN_ID,
      provider: "openai",
      region: "global",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await db.insert(meetingTranscriptTurn).values({
      endMs: 2000,
      id: `meeting_lifecycle_turn_${SUFFIX}`,
      revisionId: TRANSCRIPT_ID,
      sequence: 0,
      speakerDisplayName: "Wen",
      speakerKey: "remote:0",
      startMs: 1000,
      text: "private lifecycle transcript",
      track: "remote",
    });
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      finishedAt: now,
      id: INTELLIGENCE_RUN_ID,
      idempotencyKey: `meeting-lifecycle-intelligence-${SUFFIX}`,
      inputTranscriptRevisionId: TRANSCRIPT_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "prompt-v1",
      provider: "openai",
      region: "global",
      requestKind: "automatic",
      stage: "meeting-intelligence",
      status: "succeeded",
      templateKey: "general",
    });
    await db.insert(meetingIntelligenceRevision).values({
      content: { summary: "private summary" },
      id: INTELLIGENCE_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      processingRunId: INTELLIGENCE_RUN_ID,
      promptVersion: "prompt-v1",
      provider: "openai",
      revision: 1,
      templateKey: "general",
      transcriptRevisionId: TRANSCRIPT_ID,
    });
    await db.insert(meetingQuestionThread).values({
      createdBy: OWNER_ID,
      id: `meeting_lifecycle_thread_${SUFFIX}`,
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      title: "Private question",
    });
    await db.insert(meetingQuestionExchange).values({
      createdBy: OWNER_ID,
      id: `meeting_lifecycle_exchange_${SUFFIX}`,
      inputIntelligenceRevisionId: INTELLIGENCE_ID,
      inputTranscriptRevisionId: TRANSCRIPT_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      promptVersion: "answer-v1",
      provider: "openai",
      question: "What happened?",
      requestId: `request-${SUFFIX}`,
      sequence: 1,
      status: "pending",
      threadId: `meeting_lifecycle_thread_${SUFFIX}`,
    });
    await db
      .update(meetingSession)
      .set({
        activeIntelligenceRevisionId: INTELLIGENCE_ID,
        activeTranscriptRevisionId: TRANSCRIPT_ID,
        intelligenceStatus: "ready",
      })
      .where(eq(meetingSession.id, MEETING_ID));
  }, 30_000);

  afterEach(async () => {
    vi.unstubAllEnvs();
    await clean();
  }, 30_000);

  it("re-admits an uploading meeting before restoring it from trash", async () => {
    await withDatabaseAdvisoryTestLock("meeting-direct-capacity-integration", async () => {
      const now = testTime(60 * 60 * 1000);
      const blockerId = `meeting_lifecycle_blocker_${SUFFIX}`;
      await db
        .update(meetingSession)
        .set({
          status: "uploading",
          uploadLeaseExpiresAt: new Date(now.getTime() + 60_000),
        })
        .where(eq(meetingSession.id, MEETING_ID));
      await trashMeetingSession({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        now,
        organizationId: ORGANIZATION_ID,
      });
      await expect(
        db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
      ).resolves.toMatchObject({
        status: "trashed",
        uploadLeaseExpiresAt: expect.any(Date),
      });
      await db
        .update(meetingSession)
        .set({ uploadLeaseExpiresAt: new Date(now.getTime() - 1000) })
        .where(eq(meetingSession.id, MEETING_ID));
      await db.insert(meetingSession).values({
        id: blockerId,
        manifestSha256: "b".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: OWNER_ID,
        savedAt: now,
        startedAt: now,
        status: "uploading",
        title: "Capacity blocker",
        uploadLeaseExpiresAt: new Date(now.getTime() + 60_000),
      });
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1");

      await expect(
        restoreMeetingSession({
          actorId: OWNER_ID,
          meetingId: MEETING_ID,
          now,
          organizationId: ORGANIZATION_ID,
        }),
      ).resolves.toEqual({ state: "capacity" });
      await expect(
        db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
      ).resolves.toMatchObject({
        status: "trashed",
        uploadLeaseExpiresAt: expect.any(Date),
      });

      await db
        .update(meetingSession)
        .set({ status: "workspace-verified", uploadLeaseExpiresAt: null })
        .where(eq(meetingSession.id, blockerId));
      vi.stubEnv("MEETING_DIRECT_UPLOAD_CONCURRENCY", "1000000");
      await expect(
        restoreMeetingSession({
          actorId: OWNER_ID,
          meetingId: MEETING_ID,
          now,
          organizationId: ORGANIZATION_ID,
        }),
      ).resolves.toEqual({ state: "restored" });
      await expect(
        db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
      ).resolves.toMatchObject({ status: "uploading" });
      const restored = await db.query.meetingSession.findFirst({ where: { id: MEETING_ID } });
      expect(restored?.uploadLeaseExpiresAt?.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  it("atomically hides a meeting, unlinks recruiting context and restores before the deadline", async () => {
    const now = testTime(60 * 60 * 1000);
    await expect(
      trashMeetingSession({
        actorId: EDITOR_ID,
        meetingId: MEETING_ID,
        now,
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toEqual({ state: "forbidden" });
    await db
      .update(meetingProcessingRun)
      .set({ finishedAt: null, status: "processing" })
      .where(eq(meetingProcessingRun.id, FINAL_RUN_ID));
    await db
      .update(meetingSession)
      .set({ transcriptionRunId: FINAL_RUN_ID, transcriptionStatus: "processing" })
      .where(eq(meetingSession.id, MEETING_ID));
    const trashed = await trashMeetingSession({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      now,
      organizationId: ORGANIZATION_ID,
    });
    expect(trashed).toMatchObject({ state: "trashed" });
    await expect(
      publishMeetingTranscript({
        meetingId: MEETING_ID,
        model: "whisper-1",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "final-v1",
        policyRevision: 1,
        processingRunId: FINAL_RUN_ID,
        provider: "openai",
        region: "global",
        sourceManifestSha256: "a".repeat(64),
        transcript: { language: "zh", turns: [] },
      }),
    ).resolves.toBe(false);
    await expect(
      loadMeetingSessionForAccess({
        includeAllPrivateMeetings: true,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        userId: OWNER_ID,
      }),
    ).resolves.toBeNull();
    await expect(
      listMeetingQuestionThreads({
        createdBy: OWNER_ID,
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toBeNull();
    await expect(
      db.query.meetingRecruitingContext.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.studioInterview.findFirst({ where: { id: CANDIDATE_ID } }),
    ).resolves.toBeDefined();
    await expect(
      db.query.meetingSearchProjection.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toBeUndefined();

    await expect(
      restoreMeetingSession({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        now: testTime(25 * 60 * 60 * 1000),
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toEqual({ state: "restored" });
    await expect(
      db.query.meetingSearchProjection.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toBeDefined();
    await expect(
      db.query.meetingAccessGrant.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toBeDefined();
  });

  // oxlint-disable-next-line complexity -- one scenario verifies the complete two-phase purge graph and durable tombstone.
  it("purges the complete artifact graph and keeps the linked Candidate record", async () => {
    const now = testTime(60 * 60 * 1000);
    await db.insert(meetingStorageCleanupKey).values({
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      storageKey: `meeting-lifecycle/${SUFFIX}/playback/orphan-run.webm`,
    });
    await expect(
      requestMeetingPurge({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        now,
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toEqual({ state: "purging" });
    await expect(
      claimMeetingPurge({ meetingId: MEETING_ID, now, organizationId: ORGANIZATION_ID }),
    ).resolves.toBeNull();
    await expect(
      loadMeetingLocalRecoveryDirective({
        actorId: OWNER_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
      }),
    ).resolves.toBe("delete");
    await expect(
      recordMeetingLocalRecoveryCleanup({
        actorId: OWNER_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
        status: "deleted",
      }),
    ).resolves.toBe("recorded");
    const firstClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 62 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    expect(firstClaim?.phase).toBe("initial");
    expect(firstClaim?.storageKeys).toHaveLength(4);
    expect(firstClaim?.providerArtifacts).toEqual([]);
    await expect(
      completeMeetingPurgeStorageBatch({
        executionToken: firstClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        now: new Date(now.getTime() + 62 * 60 * 1000),
        organizationId: ORGANIZATION_ID,
        phase: "initial",
        storageCleanupKeys: firstClaim?.storageCleanupKeys ?? [],
      }),
    ).resolves.toBe("quiet-period");
    await expect(
      claimMeetingPurge({
        meetingId: MEETING_ID,
        now: new Date(now.getTime() + 90 * 60 * 1000),
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toBeNull();
    const providerClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 124 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    expect(providerClaim?.phase).toBe("final");
    expect(providerClaim?.providerArtifacts).toEqual([
      expect.objectContaining({ processingRunId: FINAL_RUN_ID, provider: "openai" }),
      expect.objectContaining({ processingRunId: INTELLIGENCE_RUN_ID, provider: "openai" }),
    ]);
    await expect(
      completeMeetingPurgeStorageBatch({
        executionToken: providerClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        phase: "final",
        storageCleanupKeys: providerClaim?.storageCleanupKeys ?? [],
      }),
    ).resolves.toBe("ready");
    await recordMeetingProviderPurgeOutcome({
      executionToken: providerClaim?.executionToken ?? "missing",
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      outcome: "deleted",
      processingRunId: FINAL_RUN_ID,
      provider: "openai",
      stage: "final-transcription",
    });
    await expect(
      recordMeetingProviderPurgeOutcome({
        executionToken: providerClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        outcome: "failed",
        processingRunId: INTELLIGENCE_RUN_ID,
        provider: "openai",
        stage: "meeting-intelligence",
      }),
    ).resolves.toBe(true);
    await releaseMeetingPurgeClaim({
      errorCode: "simulated-finalize-failure",
      executionToken: providerClaim?.executionToken ?? "missing",
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 124 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    const resumedClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 186 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    expect(resumedClaim?.providerArtifacts).toEqual([
      expect.objectContaining({ processingRunId: INTELLIGENCE_RUN_ID, provider: "openai" }),
    ]);
    await expect(
      completeMeetingPurgeStorageBatch({
        executionToken: resumedClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        phase: "final",
        storageCleanupKeys: resumedClaim?.storageCleanupKeys ?? [],
      }),
    ).resolves.toBe("ready");
    await expect(
      recordMeetingProviderPurgeOutcome({
        executionToken: resumedClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        outcome: "unsupported",
        processingRunId: INTELLIGENCE_RUN_ID,
        provider: "openai",
        stage: "meeting-intelligence",
      }),
    ).resolves.toBe(false);
    await releaseMeetingPurgeClaim({
      errorCode: "simulated-post-provider-failure",
      executionToken: resumedClaim?.executionToken ?? "missing",
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 186 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    const finalClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(now.getTime() + 248 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });
    expect(finalClaim?.providerArtifacts).toEqual([]);
    await expect(
      recordMeetingProviderPurgeOutcome({
        executionToken: resumedClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        outcome: "failed",
        processingRunId: FINAL_RUN_ID,
        provider: "openai",
        stage: "final-transcription",
      }),
    ).resolves.toBe(false);
    await expect(
      db.query.meetingProcessingRun.findFirst({
        columns: { remoteArtifactPurgeAttempts: true, remoteArtifactPurgeStatus: true },
        where: { id: FINAL_RUN_ID },
      }),
    ).resolves.toMatchObject({
      remoteArtifactPurgeAttempts: 0,
      remoteArtifactPurgeStatus: "deleted",
    });
    await expect(
      completeMeetingPurgeStorageBatch({
        executionToken: finalClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        phase: "final",
        storageCleanupKeys: finalClaim?.storageCleanupKeys ?? [],
      }),
    ).resolves.toBe("ready");
    await expect(
      finalizeMeetingPurge({
        executionToken: finalClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        providerCount: 0,
        storageObjectCount: 4,
      }),
    ).resolves.toBe(true);
    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.meetingPurgeTombstone.findFirst({ where: { meetingId: MEETING_ID } }),
    ).resolves.toMatchObject({ organizationId: ORGANIZATION_ID });
    await expect(
      loadMeetingLocalRecoveryDirective({
        actorId: OWNER_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
      }),
    ).resolves.toBe("delete");
    await db.delete(member).where(eq(member.id, `${OWNER_ID}_member`));
    await expect(
      loadMeetingLocalRecoveryDirective({
        actorId: OWNER_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
      }),
    ).resolves.toBe("delete");
    await expect(
      loadMeetingLocalRecoveryDirective({
        actorId: EDITOR_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
      }),
    ).resolves.toBe("retain");
    await expect(
      recordMeetingLocalRecoveryCleanup({
        actorId: EDITOR_ID,
        manifestSha256: "a".repeat(64),
        meetingId: MEETING_ID,
        status: "deleted",
      }),
    ).resolves.toBe("not-found");
    await expect(
      createOrLoadMeetingSession({
        assets: [
          {
            contentType: "audio/webm",
            durationMs: 60_000,
            fragmentCount: 1,
            sha256: "b".repeat(64),
            sizeBytes: 10,
            storageKey: "blocked/microphone.webm",
            track: "microphone",
          },
          {
            contentType: "audio/webm",
            durationMs: 60_000,
            fragmentCount: 1,
            sha256: "c".repeat(64),
            sizeBytes: 10,
            storageKey: "blocked/system.webm",
            track: "system",
          },
        ],
        meeting: {
          id: MEETING_ID,
          manifestSha256: "a".repeat(64),
          organizationId: ORGANIZATION_ID,
          ownerId: OWNER_ID,
          savedAt: now.toISOString(),
          startedAt: now.toISOString(),
        },
      }),
    ).resolves.toMatchObject({ blockedByPurge: true, created: false, meeting: undefined });
    await expect(
      db.query.meetingRecordingAsset.findMany({ where: { meetingId: MEETING_ID } }),
    ).resolves.toEqual([]);
    await expect(
      db.query.meetingStorageCleanupKey.findMany({ where: { meetingId: MEETING_ID } }),
    ).resolves.toEqual([]);
    await expect(
      db.query.meetingTranscriptRevision.findMany({ where: { meetingId: MEETING_ID } }),
    ).resolves.toEqual([]);
    await expect(
      db.query.meetingIntelligenceRevision.findMany({ where: { meetingId: MEETING_ID } }),
    ).resolves.toEqual([]);
    await expect(
      db.query.meetingQuestionThread.findMany({ where: { meetingId: MEETING_ID } }),
    ).resolves.toEqual([]);
    await expect(
      db.query.studioInterview.findFirst({ where: { id: CANDIDATE_ID } }),
    ).resolves.toBeDefined();
    await expect(
      db
        .select({ detail: meetingAuditLog.detail, meetingId: meetingAuditLog.meetingId })
        .from(meetingAuditLog)
        .where(
          and(
            eq(meetingAuditLog.organizationId, ORGANIZATION_ID),
            eq(meetingAuditLog.action, "meeting.purged"),
          ),
        ),
    ).resolves.toEqual([
      {
        detail: { meetingId: MEETING_ID, providerCount: 0, storageObjectCount: 4 },
        meetingId: null,
      },
    ]);
  });

  it("refuses restore once the seven-day deadline has elapsed", async () => {
    const now = testTime(60 * 60 * 1000);
    await trashMeetingSession({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      now,
      organizationId: ORGANIZATION_ID,
    });
    await expect(
      restoreMeetingSession({
        actorId: OWNER_ID,
        meetingId: MEETING_ID,
        now: testTime(8 * 24 * 60 * 60 * 1000),
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toEqual({ state: "expired" });
    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({ status: "trashed" });
  });

  it("claims storage cleanup keys in bounded deterministic batches", async () => {
    const requestedAt = testTime(60 * 60 * 1000);
    await db.insert(meetingStorageCleanupKey).values(
      Array.from({ length: 101 }, (_, index) => ({
        meetingId: MEETING_ID,
        organizationId: ORGANIZATION_ID,
        storageKey: `meeting-lifecycle/${SUFFIX}/playback/run-${String(index).padStart(3, "0")}.webm`,
      })),
    );
    await requestMeetingPurge({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      now: requestedAt,
      organizationId: ORGANIZATION_ID,
    });
    const sweepAt = new Date(requestedAt.getTime() + 62 * 60 * 1000);
    const firstClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: sweepAt,
      organizationId: ORGANIZATION_ID,
    });
    expect(firstClaim).toMatchObject({
      hasMoreStorageKeys: true,
      phase: "initial",
    });
    expect(firstClaim?.storageCleanupKeys).toHaveLength(100);
    expect(firstClaim?.storageKeys).toHaveLength(103);
    await expect(
      completeMeetingPurgeStorageBatch({
        executionToken: firstClaim?.executionToken ?? "missing",
        meetingId: MEETING_ID,
        now: sweepAt,
        organizationId: ORGANIZATION_ID,
        phase: "initial",
        storageCleanupKeys: firstClaim?.storageCleanupKeys ?? [],
      }),
    ).resolves.toBe("continue");
    const secondClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(sweepAt.getTime() + 1000),
      organizationId: ORGANIZATION_ID,
    });
    expect(secondClaim).toMatchObject({
      hasMoreStorageKeys: false,
      phase: "initial",
    });
    expect(secondClaim?.storageCleanupKeys).toHaveLength(1);
    expect(secondClaim?.storageKeys).toHaveLength(4);
  });

  it("waits for an active playback writer lease before sweeping objects", async () => {
    const requestedAt = testTime(60 * 60 * 1000);
    const sweepAt = new Date(requestedAt.getTime() + 62 * 60 * 1000);
    const writerLeaseExpiresAt = new Date(sweepAt.getTime() + 60_000);
    await db.insert(meetingStorageCleanupKey).values({
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
      storageKey: `meeting-lifecycle/${SUFFIX}/playback/active-writer.webm`,
      writerLeaseExpiresAt,
    });
    await requestMeetingPurge({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      now: requestedAt,
      organizationId: ORGANIZATION_ID,
    });

    await expect(
      claimMeetingPurge({ meetingId: MEETING_ID, now: sweepAt, organizationId: ORGANIZATION_ID }),
    ).resolves.toBeNull();
    await expect(
      claimMeetingPurge({
        meetingId: MEETING_ID,
        now: new Date(writerLeaseExpiresAt.getTime() + 1),
        organizationId: ORGANIZATION_ID,
      }),
    ).resolves.toMatchObject({ phase: "initial" });
  });

  it("claims provider artifacts in bounded batches", async () => {
    const requestedAt = testTime(60 * 60 * 1000);
    await db.insert(meetingProcessingRun).values(
      Array.from({ length: 21 }, (_, index) => ({
        attempt: 1,
        id: `meeting_lifecycle_provider_batch_${SUFFIX}_${index}`,
        idempotencyKey: `meeting-lifecycle-provider-batch-${SUFFIX}-${index}`,
        meetingId: MEETING_ID,
        model: "gpt-4o-mini-transcribe",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "meeting-transcription-v1",
        provider: "openai",
        region: "global",
        stage: "final-transcription",
        status: "succeeded",
      })),
    );
    await requestMeetingPurge({
      actorId: OWNER_ID,
      meetingId: MEETING_ID,
      now: requestedAt,
      organizationId: ORGANIZATION_ID,
    });
    const initialSweepAt = new Date(requestedAt.getTime() + 62 * 60 * 1000);
    const initialClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: initialSweepAt,
      organizationId: ORGANIZATION_ID,
    });
    await completeMeetingPurgeStorageBatch({
      executionToken: initialClaim?.executionToken ?? "missing",
      meetingId: MEETING_ID,
      now: initialSweepAt,
      organizationId: ORGANIZATION_ID,
      phase: "initial",
      storageCleanupKeys: initialClaim?.storageCleanupKeys ?? [],
    });
    const finalClaim = await claimMeetingPurge({
      meetingId: MEETING_ID,
      now: new Date(requestedAt.getTime() + 124 * 60 * 1000),
      organizationId: ORGANIZATION_ID,
    });

    expect(finalClaim).toMatchObject({ hasMoreProviderArtifacts: true, phase: "final" });
    expect(finalClaim?.providerArtifacts).toHaveLength(20);
  });
});
