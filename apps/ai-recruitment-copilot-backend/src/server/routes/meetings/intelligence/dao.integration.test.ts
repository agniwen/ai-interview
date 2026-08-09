import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingProcessingRun,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import {
  claimMeetingIntelligenceRun,
  listMeetingsNeedingAutomaticIntelligence,
  loadMeetingIntelligenceResult,
  markMeetingIntelligenceFailed,
  publishMeetingIntelligence,
  requestMeetingIntelligenceRun,
  saveMeetingIntelligenceCheckpoint,
} from "./dao";

const TEST_SUFFIX = String(process.pid);
const ORGANIZATION_ID = `meeting_intelligence_org_${TEST_SUFFIX}`;
const USER_ID = `meeting_intelligence_user_${TEST_SUFFIX}`;
const MEETING_ID = `meeting_intelligence_meeting_${TEST_SUFFIX}`;
const TRANSCRIPT_ID = `meeting_intelligence_transcript_${TEST_SUFFIX}`;
const TURN_ID = `meeting_intelligence_turn_${TEST_SUFFIX}`;

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe("Meeting Intelligence publication", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(user).values({
      createdAt: new Date(),
      email: `meeting-intelligence-${TEST_SUFFIX}@example.test`,
      emailVerified: true,
      id: USER_ID,
      name: "Meeting Intelligence Tester",
      updatedAt: new Date(),
    });
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORGANIZATION_ID,
      name: "Meeting Intelligence Test",
      slug: `meeting-intelligence-${TEST_SUFFIX}`,
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: `meeting_intelligence_member_${TEST_SUFFIX}`,
      organizationId: ORGANIZATION_ID,
      role: "member",
      userId: USER_ID,
    });
    const now = new Date("2026-08-09T08:00:00.000Z");
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: "a".repeat(64),
      organizationId: ORGANIZATION_ID,
      ownerId: USER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Intelligence integration meeting",
      transcriptionStatus: "ready",
    });
    const transcriptionRunId = `meeting_intelligence_transcription_run_${TEST_SUFFIX}`;
    await db.insert(meetingProcessingRun).values({
      attempt: 1,
      id: transcriptionRunId,
      idempotencyKey: transcriptionRunId,
      meetingId: MEETING_ID,
      model: "gpt-4o-transcribe-diarize",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "final-v1",
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
      pipelineVersion: "final-v1",
      processingRunId: transcriptionRunId,
      provider: "openai",
      region: "openai-default",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await db.insert(meetingTranscriptTurn).values({
      endMs: 2000,
      id: TURN_ID,
      revisionId: TRANSCRIPT_ID,
      sequence: 0,
      speakerKey: "candidate",
      startMs: 1000,
      text: "我负责过支付项目。",
      track: "local",
    });
    await db
      .update(meetingSession)
      .set({ activeTranscriptRevisionId: TRANSCRIPT_ID })
      .where(eq(meetingSession.id, MEETING_ID));
  });

  afterEach(clean);

  it("publishes a version bound to the exact transcript and retains it after regeneration", async () => {
    await expect(listMeetingsNeedingAutomaticIntelligence()).resolves.toContainEqual({
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
    });
    const first = await requestMeetingIntelligenceRun({
      actorId: null,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "meeting-intelligence-v1",
      provider: "openai",
      requestKind: "automatic",
      template: "general",
    });
    if (!first || first === "forbidden") {
      throw new Error("expected automatic processing run");
    }
    expect(first.processingRunId).toBeTruthy();
    const firstToken = "first-execution-token";
    await expect(
      claimMeetingIntelligenceRun({
        attempt: 1,
        executionToken: firstToken,
        processingRunId: first.processingRunId,
      }),
    ).resolves.toMatchObject({ status: "claimed", transcriptRevisionId: TRANSCRIPT_ID });
    const firstContent = {
      actionItems: [],
      decisions: [{ evidenceTurnIds: [TURN_ID], statement: "继续验证支付经验" }],
      openQuestions: [],
      summary: "讨论了候选人的支付项目经验。",
      template: "general" as const,
      topics: [],
    };
    await expect(
      saveMeetingIntelligenceCheckpoint({
        content: firstContent,
        executionToken: firstToken,
        processingRunId: first.processingRunId,
      }),
    ).resolves.toBe(true);
    await expect(
      publishMeetingIntelligence({
        executionToken: firstToken,
        processingRunId: first.processingRunId,
      }),
    ).resolves.toBe(true);

    const second = await requestMeetingIntelligenceRun({
      actorId: USER_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "meeting-intelligence-v1",
      provider: "openai",
      requestKind: "manual",
      template: "recruiting-interview",
    });
    if (!second || second === "forbidden") {
      throw new Error("expected manual processing run");
    }
    await expect(
      requestMeetingIntelligenceRun({
        actorId: USER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "intelligence-v1",
        promptVersion: "meeting-intelligence-v1",
        provider: "openai",
        requestKind: "manual",
        template: "recruiting-interview",
      }),
    ).resolves.toEqual(second);
    await expect(
      requestMeetingIntelligenceRun({
        actorId: null,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "intelligence-v1",
        promptVersion: "meeting-intelligence-v1",
        provider: "openai",
        requestKind: "automatic",
        template: "recruiting-interview",
      }),
    ).resolves.toBeNull();
    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({ intelligenceRunId: second.processingRunId });
    const secondToken = "second-execution-token";
    await claimMeetingIntelligenceRun({
      attempt: 1,
      executionToken: secondToken,
      processingRunId: second.processingRunId,
    });
    await expect(
      requestMeetingIntelligenceRun({
        actorId: USER_ID,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "intelligence-v1",
        promptVersion: "meeting-intelligence-v1",
        provider: "openai",
        requestKind: "manual",
        template: "general",
      }),
    ).resolves.toEqual(second);
    await saveMeetingIntelligenceCheckpoint({
      content: {
        candidateStatements: [
          {
            attribution: "candidate",
            evidenceTurnIds: [TURN_ID],
            statement: "候选人负责过支付项目",
            verification: "stated",
          },
        ],
        followUpActions: [],
        keyExperience: [],
        summary: "讨论了候选人的支付项目经验。",
        template: "recruiting-interview",
        verificationItems: [],
      },
      executionToken: secondToken,
      processingRunId: second.processingRunId,
    });
    await publishMeetingIntelligence({
      executionToken: secondToken,
      processingRunId: second.processingRunId,
    });

    await expect(
      requestMeetingIntelligenceRun({
        actorId: null,
        meetingId: MEETING_ID,
        model: "gpt-5-mini",
        organizationId: ORGANIZATION_ID,
        pipelineVersion: "intelligence-v1",
        promptVersion: "meeting-intelligence-v1",
        provider: "openai",
        requestKind: "automatic",
        template: "general",
      }),
    ).resolves.toBeNull();

    await expect(
      loadMeetingIntelligenceResult({ meetingId: MEETING_ID, organizationId: ORGANIZATION_ID }),
    ).resolves.toMatchObject({
      current: { template: "recruiting-interview", transcriptRevisionId: TRANSCRIPT_ID },
      history: [
        { revision: 2, template: "recruiting-interview" },
        { revision: 1, template: "general" },
      ],
      state: "ready",
    });
    await expect(listMeetingsNeedingAutomaticIntelligence()).resolves.not.toContainEqual({
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
    });
  });

  it("keeps the recording and authoritative transcript ready when generation fails", async () => {
    const requested = await requestMeetingIntelligenceRun({
      actorId: USER_ID,
      meetingId: MEETING_ID,
      model: "gpt-5-mini",
      organizationId: ORGANIZATION_ID,
      pipelineVersion: "intelligence-v1",
      promptVersion: "meeting-intelligence-v1",
      provider: "openai",
      requestKind: "manual",
      template: "general",
    });
    if (!requested || requested === "forbidden") {
      throw new Error("expected processing run");
    }
    await db
      .update(meetingProcessingRun)
      .set({ result: { legacyCheckpoint: true } })
      .where(eq(meetingProcessingRun.id, requested.processingRunId));
    await expect(
      claimMeetingIntelligenceRun({
        attempt: 5,
        executionToken: "failed-execution-token",
        processingRunId: requested.processingRunId,
      }),
    ).resolves.toMatchObject({ checkpointInvalid: true, status: "claimed" });

    await expect(
      markMeetingIntelligenceFailed({
        errorMessage: "/tmp/internal/provider-secret",
        executionToken: "failed-execution-token",
        processingRunId: requested.processingRunId,
        terminal: true,
      }),
    ).resolves.toBe(true);

    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({
      activeTranscriptRevisionId: TRANSCRIPT_ID,
      intelligenceError: "Meeting Intelligence 生成失败，请稍后重试。",
      intelligenceStatus: "failed",
      status: "ready",
      transcriptionStatus: "ready",
    });
  });
});
