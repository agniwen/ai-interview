import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  meetingSession,
  meetingTranscriptRevision,
  meetingProcessingRun,
  organization,
  user,
} from "@app/db-schema/schema";
import { db } from "../db";
import {
  meetingIntelligenceDao,
  meetingPurgeDao,
  meetingTranscriptionDao,
} from "../meeting-processing-daos";
import {
  listRecoverableMeetingPlaybackJobs,
  loadMeetingPlaybackSource,
  markMeetingPlaybackProcessing,
  publishMeetingPlaybackAsset,
} from "./dao";

const namespace = randomUUID();
const org = `echo-fence-${namespace}`;
const owner = `echo-owner-${namespace}`;
const device = randomUUID();
const worker = randomUUID();
const run = randomUUID();
async function clean() {
  await db.delete(organization).where(eq(organization.id, org));
  await db.delete(user).where(eq(user.id, owner));
}

describe("Echo is fenced out of Worker", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(user).values({
      email: `${namespace}@example.test`,
      emailVerified: true,
      id: owner,
      name: "Echo test",
    });
    await db
      .insert(organization)
      .values({ createdAt: new Date(), id: org, name: "Echo test", slug: org });
    await db.insert(meetingSession).values(
      [device, worker].map((id) => ({
        id,
        manifestSha256: "a".repeat(64),
        organizationId: org,
        ownerId: owner,
        processingOwner: id === device ? "device" : "worker",
        processingRunId: run,
        savedAt: new Date(),
        startedAt: new Date(),
        status: "processing",
        title: "Echo isolation",
      })),
    );
  });
  afterEach(clean);

  it("does not recover, load, claim or publish device playback while retaining Worker eligibility", async () => {
    const jobs = await listRecoverableMeetingPlaybackJobs();
    expect(jobs.some((job) => job.meetingId === device)).toBe(false);
    expect(jobs.some((job) => job.meetingId === worker)).toBe(true);
    expect(
      await loadMeetingPlaybackSource({ meetingId: device, organizationId: org }),
    ).toBeUndefined();
    expect(
      await markMeetingPlaybackProcessing({
        meetingId: device,
        organizationId: org,
        processingRunId: randomUUID(),
      }),
    ).toBe(false);
    expect(
      await publishMeetingPlaybackAsset({
        contentType: "audio/webm",
        durationMs: 1000,
        meetingId: device,
        organizationId: org,
        processingRunId: run,
        sha256: "b".repeat(64),
        sizeBytes: 100,
        storageKey: "must-not-publish",
      }),
    ).toBe(false);
    expect(
      await markMeetingPlaybackProcessing({
        meetingId: worker,
        organizationId: org,
        processingRunId: run,
      }),
    ).toBe(true);
  });

  it("ignores device transcription, intelligence recovery and late intelligence tokens", async () => {
    const revisionId = randomUUID();
    const transcriptRunId = randomUUID();
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      id: transcriptRunId,
      idempotencyKey: transcriptRunId,
      meetingId: device,
      model: "test",
      organizationId: org,
      pipelineVersion: "test",
      provider: "qwen",
      region: "global",
      stage: "final-transcription",
      status: "succeeded",
    });
    await db.insert(meetingTranscriptRevision).values({
      id: revisionId,
      kind: "final",
      meetingId: device,
      model: "test",
      organizationId: org,
      pipelineVersion: "test",
      processingRunId: transcriptRunId,
      provider: "qwen",
      region: "global",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      executionToken: "old-worker-token",
      id: run,
      idempotencyKey: run,
      inputTranscriptRevisionId: revisionId,
      meetingId: device,
      model: "test",
      organizationId: org,
      pipelineVersion: "test",
      promptVersion: "test",
      provider: "mastra",
      region: "global",
      requestKind: "automatic",
      stage: "meeting-intelligence",
      startedAt: new Date(0),
      status: "processing",
      templateKey: "general",
    });
    await db
      .update(meetingSession)
      .set({ intelligenceRunId: run, status: "ready", transcriptionStatus: "pending" })
      .where(eq(meetingSession.id, device));
    expect(
      await meetingTranscriptionDao.getMeetingTranscriptionJobForMeeting({
        meetingId: device,
        organizationId: org,
      }),
    ).toBeNull();
    const transcriptionJobs =
      await meetingTranscriptionDao.listRecoverableMeetingTranscriptionJobs();
    expect(transcriptionJobs.some((job) => job.meetingId === device)).toBe(false);
    const intelligenceJobs = await meetingIntelligenceDao.listRecoverableMeetingIntelligenceJobs();
    expect(intelligenceJobs.some((job) => job.processingRunId === run)).toBe(false);
    expect(
      await meetingIntelligenceDao.publishMeetingIntelligence({
        executionToken: "old-worker-token",
        processingRunId: run,
      }),
    ).toBe(false);
  });

  it("leaves due device cleanup for Echo", async () => {
    await db
      .update(meetingSession)
      .set({
        purgeAfter: new Date(0),
        status: "purging",
        trashedAt: new Date(0),
        trashedFromStatus: "processing",
      })
      .where(eq(meetingSession.id, device));
    const purgeJobs = await meetingPurgeDao.listRecoverableMeetingPurgeJobs();
    expect(purgeJobs.some((job) => job.meetingId === device)).toBe(false);
    expect(
      await meetingPurgeDao.claimMeetingPurge({ meetingId: device, organizationId: org }),
    ).toBeNull();
  });
});
