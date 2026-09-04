import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  meetingAccessGrant,
  meetingProcessingRun,
  meetingQuestionExchange,
  meetingQuestionThread,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
  organization,
  user,
} from "@app/db-schema/schema";
import { db } from "../db";
import {
  claimMeetingAnswerExchange,
  loadMeetingAnswerContext,
  publishMeetingAnswerExchange,
} from "./dao";

const SUFFIX = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const ORGANIZATION_ID = `worker_answer_org_${SUFFIX}`;
const OWNER_ID = `worker_answer_owner_${SUFFIX}`;
const VIEWER_ID = `worker_answer_viewer_${SUFFIX}`;
const OWNER_MEMBER_ID = `worker_answer_owner_member_${SUFFIX}`;
const VIEWER_MEMBER_ID = `worker_answer_viewer_member_${SUFFIX}`;
const MEETING_ID = `worker_answer_meeting_${SUFFIX}`;
const TRANSCRIPT_ID = `worker_answer_transcript_${SUFFIX}`;
const TURN_ID = `worker_answer_turn_${SUFFIX}`;

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, OWNER_ID));
  await db.delete(user).where(eq(user.id, VIEWER_ID));
}

async function createExchange(createdBy: string, suffix: string) {
  const threadId = `worker_answer_thread_${suffix}_${SUFFIX}`;
  const exchangeId = `worker_answer_exchange_${suffix}_${SUFFIX}`;
  await db.insert(meetingQuestionThread).values({
    createdBy,
    id: threadId,
    meetingId: MEETING_ID,
    organizationId: ORGANIZATION_ID,
    title: "项目经验",
  });
  await db.insert(meetingQuestionExchange).values({
    createdBy,
    id: exchangeId,
    inputTranscriptRevisionId: TRANSCRIPT_ID,
    meetingId: MEETING_ID,
    model: "gpt-5-mini",
    organizationId: ORGANIZATION_ID,
    promptVersion: "meeting-answer-v1",
    provider: "mastra",
    question: "谁负责支付迁移？",
    requestId: crypto.randomUUID(),
    sequence: 1,
    threadId,
  });
  return exchangeId;
}

describe("Meeting Answer worker persistence", () => {
  beforeEach(async () => {
    await clean();
    const now = new Date("2026-08-09T12:30:00.000Z");
    await db.insert(user).values([
      {
        createdAt: now,
        email: `worker-answer-owner-${SUFFIX}@example.test`,
        emailVerified: true,
        id: OWNER_ID,
        name: "Owner",
        updatedAt: now,
      },
      {
        createdAt: now,
        email: `worker-answer-viewer-${SUFFIX}@example.test`,
        emailVerified: true,
        id: VIEWER_ID,
        name: "Viewer",
        updatedAt: now,
      },
    ]);
    await db.insert(organization).values({
      createdAt: now,
      id: ORGANIZATION_ID,
      name: "Worker Meeting Answer Test",
      slug: `worker-answer-${SUFFIX}`,
    });
    await db.insert(member).values([
      {
        createdAt: now,
        id: OWNER_MEMBER_ID,
        organizationId: ORGANIZATION_ID,
        role: "member",
        userId: OWNER_ID,
      },
      {
        createdAt: now,
        id: VIEWER_MEMBER_ID,
        organizationId: ORGANIZATION_ID,
        role: "member",
        userId: VIEWER_ID,
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
      title: "Worker Meeting Answer Test",
      transcriptionStatus: "ready",
    });
    const runId = `worker_answer_run_${SUFFIX}`;
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      id: runId,
      idempotencyKey: runId,
      meetingId: MEETING_ID,
      model: "gpt-4o-transcribe-diarize",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v2",
      provider: "openai",
      region: "openai-default",
      stage: "final-transcription",
      status: "succeeded",
    });
    await db.insert(meetingTranscriptRevision).values({
      id: TRANSCRIPT_ID,
      kind: "final",
      language: "zh",
      meetingId: MEETING_ID,
      model: "gpt-4o-transcribe-diarize",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v2",
      processingRunId: runId,
      provider: "openai",
      region: "openai-default",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await db.insert(meetingTranscriptTurn).values({
      endMs: 9000,
      id: TURN_ID,
      revisionId: TRANSCRIPT_ID,
      sequence: 0,
      speakerKey: "local",
      startMs: 3000,
      text: "支付系统迁移由候选人负责。",
      track: "local",
    });
    await db
      .update(meetingSession)
      .set({ activeTranscriptRevisionId: TRANSCRIPT_ID })
      .where(eq(meetingSession.id, MEETING_ID));
  });

  afterEach(clean);

  it("claims and publishes only against the active transcript revision", async () => {
    const exchangeId = await createExchange(OWNER_ID, "publish");
    const executionToken = `token_${SUFFIX}`;
    await expect(
      claimMeetingAnswerExchange({ attempt: 1, exchangeId, executionToken }),
    ).resolves.toMatchObject({ status: "claimed" });
    await expect(
      publishMeetingAnswerExchange({
        answer: {
          citations: [{ endMs: 9000, startMs: 3000, turnId: TURN_ID }],
          kind: "answer",
          text: "候选人负责。",
        },
        exchangeId,
        executionToken,
      }),
    ).resolves.toBe(true);
    await expect(
      db.query.meetingQuestionExchange.findFirst({ where: { id: exchangeId } }),
    ).resolves.toMatchObject({ executionToken: null, status: "ready" });
  });

  it("rejects a pending exchange after its viewer grant is revoked", async () => {
    await db.insert(meetingAccessGrant).values({
      id: `worker_answer_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId: VIEWER_MEMBER_ID,
      organizationId: ORGANIZATION_ID,
      role: "viewer",
    });
    const exchangeId = await createExchange(VIEWER_ID, "revoked");
    await db
      .delete(meetingAccessGrant)
      .where(
        and(
          eq(meetingAccessGrant.meetingId, MEETING_ID),
          eq(meetingAccessGrant.memberId, VIEWER_MEMBER_ID),
        ),
      );
    await expect(
      claimMeetingAnswerExchange({ attempt: 1, exchangeId, executionToken: "revoked-token" }),
    ).resolves.toEqual({ status: "not-authorized" });
  });

  it("does not load meeting content after access is revoked post-claim", async () => {
    await db.insert(meetingAccessGrant).values({
      id: `worker_answer_race_grant_${SUFFIX}`,
      meetingId: MEETING_ID,
      memberId: VIEWER_MEMBER_ID,
      organizationId: ORGANIZATION_ID,
      role: "viewer",
    });
    const exchangeId = await createExchange(VIEWER_ID, "race");
    const executionToken = "revocation-race-token";
    await claimMeetingAnswerExchange({ attempt: 1, exchangeId, executionToken });
    await db.delete(meetingAccessGrant).where(eq(meetingAccessGrant.memberId, VIEWER_MEMBER_ID));
    await expect(loadMeetingAnswerContext({ exchangeId, executionToken })).resolves.toBeNull();
  });
});
