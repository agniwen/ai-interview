import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptRevision,
  organization,
  user,
} from "@arc/db-schema/schema";
import { createFixtureNamespace } from "../../../test-utils/fixture-id";
import { loadMeetingOperationsSnapshot } from "./operations-dao";

const NS = createFixtureNamespace("meeting_ops");
const ORGANIZATION_ID = `${NS}_org`;
const USER_ID = `${NS}_user`;
const READY_MEETING_ID = `${NS}_ready`;
const STUCK_INTELLIGENCE_ID = `${NS}_stuck_intelligence`;
const STUCK_RETRY_TRANSCRIPTION_ID = `${NS}_stuck_retry_transcription`;
const STUCK_UPLOAD_ID = `${NS}_stuck_upload`;
const STUCK_TRANSCRIPTION_ID = `${NS}_stuck_transcription`;

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe("Meeting operations snapshot", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date();
    await db.insert(user).values({
      createdAt: now,
      email: `${USER_ID}@example.test`,
      emailVerified: true,
      id: USER_ID,
      name: "Meeting Ops User",
      updatedAt: now,
    });
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Meeting Ops Test",
      slug: `${NS}-org`,
    });
    const savedAt = new Date(now.getTime() - 20_000);
    const verifiedAt = new Date(now.getTime() - 10_000);
    await db.insert(meetingSession).values([
      {
        id: READY_MEETING_ID,
        manifestSha256: "a".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: USER_ID,
        savedAt,
        startedAt: savedAt,
        status: "ready",
        title: "not returned by operations",
        verifiedAt,
      },
      {
        id: STUCK_UPLOAD_ID,
        manifestSha256: "b".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: USER_ID,
        savedAt: new Date(now.getTime() - 60 * 60 * 1000),
        startedAt: savedAt,
        status: "uploading",
        title: "not returned by operations",
        uploadLeaseExpiresAt: new Date(now.getTime() - 1000),
      },
      {
        id: STUCK_TRANSCRIPTION_ID,
        manifestSha256: "c".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: USER_ID,
        savedAt,
        startedAt: savedAt,
        status: "ready",
        title: "recent metadata update must not hide the stuck run",
        transcriptionStatus: "processing",
        verifiedAt,
      },
      {
        id: STUCK_RETRY_TRANSCRIPTION_ID,
        manifestSha256: "d".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: USER_ID,
        savedAt,
        startedAt: savedAt,
        status: "ready",
        title: "retrying transcription must remain diagnosable",
        transcriptionStatus: "processing",
        verifiedAt,
      },
      {
        id: STUCK_INTELLIGENCE_ID,
        intelligenceStatus: "processing",
        manifestSha256: "e".repeat(64),
        organizationId: ORGANIZATION_ID,
        ownerId: USER_ID,
        savedAt,
        startedAt: savedAt,
        status: "ready",
        title: "retrying intelligence must remain diagnosable",
        verifiedAt,
      },
    ]);
    const succeededRunId = `${NS}_succeeded`;
    const stuckRunId = `${NS}_stuck_run`;
    await db.insert(meetingProcessingRun).values([
      {
        attempt: 1,
        finishedAt: new Date(now.getTime() - 4000),
        id: succeededRunId,
        idempotencyKey: `${succeededRunId}_key`,
        meetingId: READY_MEETING_ID,
        model: "test-model",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "final-v1",
        provider: "openai",
        region: "test-region",
        stage: "final-transcription",
        startedAt: new Date(now.getTime() - 8000),
        status: "succeeded",
      },
      {
        attempt: 2,
        errorCode: "provider-quota",
        errorMessage: "private provider diagnostic must not be returned",
        finishedAt: new Date(now.getTime() - 1000),
        id: `${NS}_failed`,
        idempotencyKey: `${NS}_failed_key`,
        meetingId: READY_MEETING_ID,
        model: "test-model",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "final-v1",
        provider: "openai",
        region: "test-region",
        stage: "final-transcription",
        startedAt: new Date(now.getTime() - 3000),
        status: "failed",
      },
      {
        attempt: 1,
        id: stuckRunId,
        idempotencyKey: `${stuckRunId}_key`,
        meetingId: STUCK_TRANSCRIPTION_ID,
        model: "test-model",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "final-v1",
        provider: "openai",
        region: "test-region",
        stage: "final-transcription",
        startedAt: new Date(now.getTime() - 60 * 60 * 1000),
        status: "processing",
      },
      {
        attempt: 2,
        errorCode: "provider-error",
        finishedAt: new Date(now.getTime() - 60 * 60 * 1000),
        id: `${NS}_stuck_retry_run`,
        idempotencyKey: `${NS}_stuck_retry_run_key`,
        meetingId: STUCK_RETRY_TRANSCRIPTION_ID,
        model: "test-model",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "final-v1",
        provider: "openai",
        region: "test-region",
        stage: "final-transcription",
        startedAt: new Date(now.getTime() - 61 * 60 * 1000),
        status: "failed",
      },
    ]);
    await db
      .update(meetingSession)
      .set({ transcriptionRunId: stuckRunId })
      .where(eq(meetingSession.id, STUCK_TRANSCRIPTION_ID));
    await db.insert(meetingTranscriptRevision).values({
      createdAt: new Date(now.getTime() - 2000),
      id: `${NS}_transcript`,
      kind: "final",
      meetingId: READY_MEETING_ID,
      model: "test-model",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
      processingRunId: succeededRunId,
      provider: "openai",
      region: "test-region",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    const intelligenceSourceRunId = `${NS}_stuck_intelligence_source_run`;
    const intelligenceTranscriptId = `${NS}_stuck_intelligence_transcript`;
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      finishedAt: new Date(now.getTime() - 70 * 60 * 1000),
      id: intelligenceSourceRunId,
      idempotencyKey: `${intelligenceSourceRunId}_key`,
      meetingId: STUCK_INTELLIGENCE_ID,
      model: "test-model",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
      provider: "openai",
      region: "test-region",
      stage: "final-transcription",
      startedAt: new Date(now.getTime() - 71 * 60 * 1000),
      status: "succeeded",
    });
    await db.insert(meetingTranscriptRevision).values({
      id: intelligenceTranscriptId,
      kind: "final",
      meetingId: STUCK_INTELLIGENCE_ID,
      model: "test-model",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
      processingRunId: intelligenceSourceRunId,
      provider: "openai",
      region: "test-region",
      revision: 1,
      sourceManifestSha256: "e".repeat(64),
    });
    const intelligenceRunId = `${NS}_stuck_intelligence_run`;
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      id: intelligenceRunId,
      idempotencyKey: `${intelligenceRunId}_key`,
      inputTranscriptRevisionId: intelligenceTranscriptId,
      meetingId: STUCK_INTELLIGENCE_ID,
      model: "test-model",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "prompt-v1",
      provider: "openai",
      region: "test-region",
      requestKind: "automatic",
      stage: "meeting-intelligence",
      startedAt: new Date(now.getTime() - 60 * 60 * 1000),
      status: "pending",
      templateKey: "general",
    });
    await db
      .update(meetingSession)
      .set({ intelligenceRunId })
      .where(eq(meetingSession.id, STUCK_INTELLIGENCE_ID));
  }, 30_000);

  afterEach(clean, 30_000);

  it("returns bounded actionable evidence without Meeting content or raw errors", async () => {
    const snapshot = await loadMeetingOperationsSnapshot();

    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({ kind: "stuck-upload", meetingId: STUCK_UPLOAD_ID }),
    );
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({
        kind: "stuck-final-transcription",
        meetingId: STUCK_TRANSCRIPTION_ID,
      }),
    );
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({
        kind: "stuck-final-transcription",
        meetingId: STUCK_RETRY_TRANSCRIPTION_ID,
      }),
    );
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({
        kind: "stuck-intelligence",
        meetingId: STUCK_INTELLIGENCE_ID,
      }),
    );
    expect(snapshot.latency.saveToUpload.count).toBeGreaterThan(0);
    expect(snapshot.latency.uploadToTranscript.count).toBeGreaterThan(0);
    const providerQuotaFailure = snapshot.providerFailures.find(
      (failure) =>
        failure.errorCode === "provider-quota" &&
        failure.provider === "openai" &&
        failure.stage === "final-transcription",
    );
    expect(providerQuotaFailure?.count).toBeGreaterThanOrEqual(1);
    expect(snapshot.queueRetries).toContainEqual(
      expect.objectContaining({ retries: expect.any(Number), stage: "final-transcription" }),
    );
    expect(JSON.stringify(snapshot)).not.toContain("private provider diagnostic");
    expect(JSON.stringify(snapshot)).not.toContain("not returned by operations");
  });
});
