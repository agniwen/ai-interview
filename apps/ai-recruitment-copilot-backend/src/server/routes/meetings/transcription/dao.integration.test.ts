/* oxlint-disable max-lines -- integration suite covering run claims, policy linearization, chunk checkpoints, and default-policy materialization in one transactional fixture. */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  meetingProcessingRun,
  meetingRecordingAsset,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  meetingTranscriptionChunk,
  meetingTranscriptionPolicy,
  member,
  organization,
  user,
} from "@arc/db-schema/schema";
import {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  getMeetingTranscriptionJobForMeeting,
  loadMeetingTranscriptionChunkCheckpoint,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  saveMeetingTranscriptionChunkCheckpoint,
  updateMeetingTranscriptionPolicy,
} from "./dao";
import { createHumanMeetingTranscriptRevision } from "./revision-dao";
import { searchMeetingSessionsForAccess } from "../routes/search/dao";

const TEST_SUFFIX = String(process.pid);
const ORGANIZATION_ID = `meeting_transcription_test_org_${TEST_SUFFIX}`;
const USER_ID = `meeting_transcription_test_user_${TEST_SUFFIX}`;
const MEETING_ID = `meeting_transcription_test_meeting_${TEST_SUFFIX}`;
const SOURCE_SHA = "a".repeat(64);
const runId = (name: string) => `${name}-${TEST_SUFFIX}`;

const job = {
  meetingId: MEETING_ID,
  model: "gpt-4o-transcribe-diarize",
  organizationId: ORGANIZATION_ID,
  pipelineVersion: "final-v1" as const,
  policyRevision: 1,
  provider: "openai" as const,
  region: "openai-default",
  sourceManifestSha256: SOURCE_SHA,
};

function searchTranscript(query: string) {
  return searchMeetingSessionsForAccess({
    limit: 20,
    organizationId: ORGANIZATION_ID,
    query,
    timeZone: "UTC",
    userId: USER_ID,
  }).then((result) => result.records);
}

async function clean(): Promise<void> {
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

describe("Meeting transcription publication", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(user).values({
      createdAt: new Date(),
      email: `meeting-transcription-${TEST_SUFFIX}@example.test`,
      emailVerified: true,
      id: USER_ID,
      name: "Meeting Transcription Tester",
      updatedAt: new Date(),
    });
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORGANIZATION_ID,
      name: "Meeting Transcription Test",
      slug: `meeting-transcription-test-${TEST_SUFFIX}`,
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: `meeting_transcription_test_member_${TEST_SUFFIX}`,
      organizationId: ORGANIZATION_ID,
      role: "admin",
      userId: USER_ID,
    });
    const now = new Date("2026-08-09T08:00:00.000Z");
    await db.insert(meetingSession).values({
      id: MEETING_ID,
      manifestSha256: SOURCE_SHA,
      organizationId: ORGANIZATION_ID,
      ownerId: USER_ID,
      savedAt: now,
      startedAt: now,
      status: "ready",
      title: "Transcription integration meeting",
    });
    await db.insert(meetingRecordingAsset).values([
      {
        contentType: "audio/webm",
        durationMs: 10_000,
        fragmentCount: 1,
        id: `${MEETING_ID}:microphone`,
        meetingId: MEETING_ID,
        sha256: "b".repeat(64),
        sizeBytes: 100,
        status: "ready",
        storageKey: `${MEETING_ID}/microphone.webm`,
        track: "microphone",
        uploadMode: "single",
        verifiedAt: now,
      },
      {
        contentType: "audio/webm",
        durationMs: 10_000,
        fragmentCount: 1,
        id: `${MEETING_ID}:system`,
        meetingId: MEETING_ID,
        sha256: "c".repeat(64),
        sizeBytes: 100,
        status: "ready",
        storageKey: `${MEETING_ID}/system.webm`,
        track: "system",
        uploadMode: "single",
        verifiedAt: now,
      },
    ]);
    await db.insert(meetingTranscriptionPolicy).values({
      allowedProviders: ["openai"],
      organizationId: ORGANIZATION_ID,
      selectedProvider: "openai",
      selectionReason: "同一授权语料评测后选择 OpenAI。",
      updatedBy: USER_ID,
    });
  }, 30_000);

  afterEach(clean, 30_000);

  it("publishes one revision when an old provider-success run loses its DB lease", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-old") }),
    ).resolves.toBe("claimed");
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 2, processingRunId: runId("run-winner") }),
    ).resolves.toBe("claimed");

    const transcript = {
      language: "zh",
      turns: [
        {
          confidence: null,
          endMs: 2000,
          speakerKey: "local",
          startMs: 1000,
          text: "最终稿",
          track: "local" as const,
        },
      ],
    };
    await expect(
      publishMeetingTranscript({ ...job, processingRunId: runId("run-old"), transcript }),
    ).resolves.toBe(false);
    await expect(
      publishMeetingTranscript({ ...job, processingRunId: runId("run-winner"), transcript }),
    ).resolves.toBe(true);
    await expect(searchTranscript("最终稿")).resolves.toMatchObject([
      { id: MEETING_ID, match: { kind: "transcript", startMs: 1000 } },
    ]);
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 3, processingRunId: runId("run-restart") }),
    ).resolves.toBe("already-ready");

    await expect(
      db
        .select({ id: meetingTranscriptRevision.id })
        .from(meetingTranscriptRevision)
        .where(eq(meetingTranscriptRevision.meetingId, MEETING_ID)),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .select({ id: meetingTranscriptTurn.id })
        .from(meetingTranscriptTurn)
        .innerJoin(
          meetingTranscriptRevision,
          eq(meetingTranscriptRevision.id, meetingTranscriptTurn.revisionId),
        )
        .where(eq(meetingTranscriptRevision.meetingId, MEETING_ID)),
    ).resolves.toHaveLength(1);

    const runs = await db
      .select({ attempt: meetingProcessingRun.attempt, status: meetingProcessingRun.status })
      .from(meetingProcessingRun)
      .where(
        and(
          eq(meetingProcessingRun.meetingId, MEETING_ID),
          eq(meetingProcessingRun.provider, "openai"),
          eq(meetingProcessingRun.model, "gpt-4o-transcribe-diarize"),
          eq(meetingProcessingRun.region, "openai-default"),
        ),
      );
    expect(runs).toEqual(
      expect.arrayContaining([
        { attempt: 1, status: "failed" },
        { attempt: 2, status: "succeeded" },
      ]),
    );
  });

  it("keeps the machine revision immutable and detects concurrent human corrections", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-correct") }),
    ).resolves.toBe("claimed");
    await expect(
      publishMeetingTranscript({
        ...job,
        processingRunId: runId("run-correct"),
        transcript: {
          language: "zh",
          turns: [
            {
              confidence: 0.8,
              endMs: 2000,
              speakerKey: "local",
              startMs: 1000,
              text: "机器原文",
              track: "local",
            },
          ],
        },
      }),
    ).resolves.toBe(true);
    const machine = await db.query.meetingTranscriptRevision.findFirst({
      where: { meetingId: MEETING_ID },
      with: { turns: true },
    });
    expect(machine).toBeTruthy();
    await db
      .update(meetingSession)
      .set({ intelligenceStatus: "ready" })
      .where(eq(meetingSession.id, MEETING_ID));

    const correction = {
      actorId: USER_ID,
      correction: {
        language: "zh",
        sourceRevisionId: machine?.id ?? "missing",
        turns: [
          {
            confidence: null,
            endMs: 2000,
            speakerDisplayName: "面试官",
            speakerKey: "local",
            startMs: 1000,
            text: "人工修正文",
            track: "local" as const,
          },
        ],
      },
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
    };
    await expect(
      createHumanMeetingTranscriptRevision({
        ...correction,
        correction: {
          ...correction.correction,
          turns: correction.correction.turns.map((turn) => ({ ...turn, endMs: 10_001 })),
        },
      }),
    ).resolves.toBe("invalid-range");
    const results = await Promise.all([
      createHumanMeetingTranscriptRevision(correction),
      createHumanMeetingTranscriptRevision(correction),
    ]);
    expect(results.filter((result) => result === "conflict")).toHaveLength(1);
    const human = results.find((result) => typeof result !== "string");
    expect(human).toMatchObject({
      basedOnRevisionId: machine?.id,
      createdBy: { id: USER_ID },
      kind: "human",
      revision: 2,
      turns: [{ speakerDisplayName: "面试官", text: "人工修正文" }],
    });
    if (!human || typeof human === "string") {
      throw new Error("expected one human correction winner");
    }
    const secondHuman = await createHumanMeetingTranscriptRevision({
      ...correction,
      correction: {
        ...correction.correction,
        sourceRevisionId: human.id,
        turns: correction.correction.turns.map((turn) => ({
          ...turn,
          text: "第二次人工修正",
        })),
      },
    });
    expect(secondHuman).toMatchObject({
      basedOnRevisionId: human.id,
      kind: "human",
      revision: 3,
    });
    if (typeof secondHuman === "string") {
      throw new TypeError("expected a second human correction");
    }
    await expect(searchTranscript("机器原文")).resolves.toEqual([]);
    await expect(searchTranscript("第二次人工修正")).resolves.toMatchObject([
      { match: { kind: "transcript", startMs: 1000 } },
    ]);
    await expect(searchTranscript("面试官")).resolves.toMatchObject([
      { match: { kind: "speaker", startMs: 1000 } },
    ]);
    await expect(
      claimMeetingTranscriptionRun({
        ...job,
        attempt: 2,
        processingRunId: runId("run-correct-redelivery"),
      }),
    ).resolves.toBe("already-ready");
    await expect(
      db.query.meetingSession.findFirst({
        columns: {
          activeTranscriptRevisionId: true,
          intelligenceRunId: true,
          intelligenceStatus: true,
        },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({
      activeTranscriptRevisionId: secondHuman.id,
      intelligenceRunId: null,
      intelligenceStatus: "pending",
    });

    await expect(
      db.query.meetingTranscriptRevision.findMany({
        where: { meetingId: MEETING_ID },
        with: { turns: { orderBy: { sequence: "asc" } } },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: machine?.id,
          kind: "final",
          turns: [expect.objectContaining({ speakerDisplayName: null, text: "机器原文" })],
        }),
        expect.objectContaining({ kind: "human" }),
      ]),
    );
    await expect(
      db.query.meetingAuditLog.findMany({
        where: { action: "meeting.transcript_corrected", meetingId: MEETING_ID },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: USER_ID,
          detail: expect.objectContaining({
            renamedSpeakerKeys: ["local"],
            sourceRevisionId: machine?.id,
          }),
        }),
        expect.objectContaining({
          actorId: USER_ID,
          detail: expect.objectContaining({ sourceRevisionId: human.id }),
        }),
      ]),
    );
  });

  it("persists the maximum 10,000-turn correction without exceeding PostgreSQL parameters", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-max-turns") }),
    ).resolves.toBe("claimed");
    await expect(
      publishMeetingTranscript({
        ...job,
        processingRunId: runId("run-max-turns"),
        transcript: {
          language: "zh",
          turns: [
            {
              confidence: null,
              endMs: 1,
              speakerKey: "local",
              startMs: 0,
              text: "机器原文",
              track: "local",
            },
          ],
        },
      }),
    ).resolves.toBe(true);
    const meeting = await db.query.meetingSession.findFirst({
      columns: { activeTranscriptRevisionId: true },
      where: { id: MEETING_ID },
    });
    const result = await createHumanMeetingTranscriptRevision({
      actorId: USER_ID,
      correction: {
        language: "zh",
        sourceRevisionId: meeting?.activeTranscriptRevisionId ?? "missing",
        turns: Array.from({ length: 10_000 }, (_, index) => ({
          confidence: null,
          endMs: index + 1,
          speakerDisplayName: "面试官",
          speakerKey: "local",
          startMs: index,
          text: "修正",
          track: "local" as const,
        })),
      },
      meetingId: MEETING_ID,
      organizationId: ORGANIZATION_ID,
    });

    expect(result).toMatchObject({ kind: "human", revision: 2 });
    if (typeof result === "string") {
      throw new TypeError("expected a human correction");
    }
    expect(result.turns).toHaveLength(10_000);
  });

  it("revokes an in-flight run when an administrator changes provider policy", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-revoked") }),
    ).resolves.toBe("claimed");

    await expect(
      updateMeetingTranscriptionPolicy({
        actorId: USER_ID,
        organizationId: ORGANIZATION_ID,
        policy: {
          allowedProviders: [],
          fallbackProvider: null,
          selectedProvider: null,
          selectionReason: null,
        },
      }),
    ).resolves.toMatchObject({ revision: 2, selectedProvider: null });

    await expect(
      publishMeetingTranscript({
        ...job,
        processingRunId: runId("run-revoked"),
        transcript: { language: "zh", turns: [] },
      }),
    ).resolves.toBe(false);
    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionRunId: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({ transcriptionRunId: null, transcriptionStatus: "pending" });
    await expect(
      db.query.meetingProcessingRun.findFirst({
        columns: { errorCode: true, status: true },
        where: { id: runId("run-revoked") },
      }),
    ).resolves.toMatchObject({ errorCode: "policy-changed", status: "failed" });
  });

  it("serializes a provider policy change with a concurrent run claim", async () => {
    const [claimResult] = await Promise.all([
      claimMeetingTranscriptionRun({
        ...job,
        attempt: 1,
        processingRunId: runId("run-policy-race"),
      }),
      updateMeetingTranscriptionPolicy({
        actorId: USER_ID,
        organizationId: ORGANIZATION_ID,
        policy: {
          allowedProviders: [],
          fallbackProvider: null,
          selectedProvider: null,
          selectionReason: null,
        },
      }),
    ]);

    expect(["claimed", "not-eligible"]).toContain(claimResult);
    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionRunId: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({ transcriptionRunId: null, transcriptionStatus: "pending" });
  });

  it("does not overwrite a committed publication after an ambiguous DB response", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-committed") }),
    ).resolves.toBe("claimed");
    await expect(
      publishMeetingTranscript({
        ...job,
        processingRunId: runId("run-committed"),
        transcript: { language: "zh", turns: [] },
      }),
    ).resolves.toBe(true);

    await expect(
      markMeetingTranscriptionFailed({
        ...job,
        errorCode: "provider-error",
        errorMessage: "connection closed after commit",
        processingRunId: runId("run-committed"),
        terminal: true,
      }),
    ).resolves.toBe(false);
    await expect(
      db.query.meetingProcessingRun.findFirst({
        columns: { errorCode: true, status: true },
        where: { id: runId("run-committed") },
      }),
    ).resolves.toMatchObject({ errorCode: null, status: "succeeded" });
  });

  it("keeps the meeting processing until the queue retry budget is exhausted", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-retryable") }),
    ).resolves.toBe("claimed");

    await expect(
      markMeetingTranscriptionFailed({
        ...job,
        errorCode: "provider-error",
        errorMessage: "provider temporarily unavailable",
        processingRunId: runId("run-retryable"),
        terminal: false,
      }),
    ).resolves.toBe(true);
    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionError: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({ transcriptionError: null, transcriptionStatus: "processing" });

    await claimMeetingTranscriptionRun({
      ...job,
      attempt: 5,
      processingRunId: runId("run-terminal"),
    });
    await markMeetingTranscriptionFailed({
      ...job,
      errorCode: "provider-error",
      errorMessage: "ffmpeg /tmp/private/source.webm failed at https://storage.internal",
      processingRunId: runId("run-terminal"),
      terminal: true,
    });
    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionError: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({
      transcriptionError: "最终会议转录失败，请稍后重试。",
      transcriptionStatus: "failed",
    });
  });

  it("returns a backoff meeting to pending when provider policy is disabled", async () => {
    await expect(
      claimMeetingTranscriptionRun({ ...job, attempt: 1, processingRunId: runId("run-backoff") }),
    ).resolves.toBe("claimed");
    await markMeetingTranscriptionFailed({
      ...job,
      errorCode: "provider-error",
      errorMessage: "provider temporarily unavailable",
      processingRunId: runId("run-backoff"),
      terminal: false,
    });

    await updateMeetingTranscriptionPolicy({
      actorId: USER_ID,
      organizationId: ORGANIZATION_ID,
      policy: {
        allowedProviders: [],
        fallbackProvider: null,
        selectedProvider: null,
        selectionReason: null,
      },
    });

    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionRunId: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({ transcriptionRunId: null, transcriptionStatus: "pending" });
  });

  it("rejects a stale administrator role after the member is demoted", async () => {
    await db
      .update(member)
      .set({ role: "member" })
      .where(and(eq(member.organizationId, ORGANIZATION_ID), eq(member.userId, USER_ID)));

    await expect(
      updateMeetingTranscriptionPolicy({
        actorId: USER_ID,
        organizationId: ORGANIZATION_ID,
        policy: {
          allowedProviders: [],
          fallbackProvider: null,
          selectedProvider: null,
          selectionReason: null,
        },
      }),
    ).resolves.toBeNull();
    await expect(
      db.query.meetingTranscriptionPolicy.findFirst({ where: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toMatchObject({ selectedProvider: "openai" });
  });

  it("exposes quota exhaustion without removing the verified recording", async () => {
    await claimMeetingTranscriptionRun({
      ...job,
      attempt: 5,
      processingRunId: runId("run-provider-quota"),
    });
    await markMeetingTranscriptionFailed({
      ...job,
      errorCode: "provider-quota",
      errorMessage: "Meeting transcription provider quota is exhausted",
      processingRunId: runId("run-provider-quota"),
      terminal: true,
    });

    await expect(
      db.query.meetingSession.findFirst({ where: { id: MEETING_ID } }),
    ).resolves.toMatchObject({
      status: "ready",
      transcriptionError: "最终会议转录因 provider 配额不足失败，录音已保留，请稍后重试。",
      transcriptionStatus: "failed",
    });
  });

  it("serializes a provider failure with a concurrent policy change", async () => {
    await claimMeetingTranscriptionRun({
      ...job,
      attempt: 1,
      processingRunId: runId("run-failure-policy-race"),
    });

    await Promise.all([
      markMeetingTranscriptionFailed({
        ...job,
        errorCode: "provider-error",
        errorMessage: "provider unavailable",
        processingRunId: runId("run-failure-policy-race"),
        terminal: false,
      }),
      updateMeetingTranscriptionPolicy({
        actorId: USER_ID,
        organizationId: ORGANIZATION_ID,
        policy: {
          allowedProviders: [],
          fallbackProvider: null,
          selectedProvider: null,
          selectionReason: null,
        },
      }),
    ]);

    await expect(
      db.query.meetingSession.findFirst({
        columns: { transcriptionRunId: true, transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
    ).resolves.toMatchObject({ transcriptionRunId: null, transcriptionStatus: "pending" });
    await expect(
      db.query.meetingProcessingRun.findFirst({
        columns: { status: true },
        where: { id: runId("run-failure-policy-race") },
      }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("linearizes a policy disable with a concurrent transcript publish", async () => {
    await claimMeetingTranscriptionRun({
      ...job,
      attempt: 1,
      processingRunId: runId("run-publish-policy-race"),
    });
    const [published] = await Promise.all([
      publishMeetingTranscript({
        ...job,
        processingRunId: runId("run-publish-policy-race"),
        transcript: { language: "zh", turns: [] },
      }),
      updateMeetingTranscriptionPolicy({
        actorId: USER_ID,
        organizationId: ORGANIZATION_ID,
        policy: {
          allowedProviders: [],
          fallbackProvider: null,
          selectedProvider: null,
          selectionReason: null,
        },
      }),
    ]);

    const [meeting, run, revisions] = await Promise.all([
      db.query.meetingSession.findFirst({
        columns: { transcriptionStatus: true },
        where: { id: MEETING_ID },
      }),
      db.query.meetingProcessingRun.findFirst({
        columns: { status: true },
        where: { id: runId("run-publish-policy-race") },
      }),
      db
        .select({ id: meetingTranscriptRevision.id })
        .from(meetingTranscriptRevision)
        .where(eq(meetingTranscriptRevision.meetingId, MEETING_ID)),
    ]);
    if (published) {
      expect(meeting?.transcriptionStatus).toBe("ready");
      expect(run?.status).toBe("succeeded");
      expect(revisions).toHaveLength(1);
    } else {
      expect(meeting?.transcriptionStatus).toBe("pending");
      expect(run?.status).toBe("failed");
      expect(revisions).toHaveLength(0);
    }
  });

  it("persists each provider chunk once and resumes with the original canonical result", async () => {
    const chunk = {
      contentType: "audio/webm",
      endMs: 30_000,
      filePath: "/tmp/system-000.webm",
      index: 0,
      startMs: 0,
      track: "system" as const,
    };
    const original = {
      language: "zh",
      turns: [
        {
          confidence: null,
          endMs: 2000,
          speakerKey: "remote-1",
          startMs: 1000,
          text: "首次 provider 结果",
          track: "remote" as const,
        },
      ],
    };
    await claimMeetingTranscriptionRun({
      ...job,
      attempt: 1,
      processingRunId: runId("run-chunk"),
    });
    const claims = await Promise.all([
      claimMeetingTranscriptionChunk({ ...job, processingRunId: runId("run-chunk") }, chunk),
      claimMeetingTranscriptionChunk({ ...job, processingRunId: runId("run-chunk") }, chunk),
    ]);
    expect(claims.map((claim) => claim.status).toSorted()).toEqual(["busy", "claimed"]);
    await saveMeetingTranscriptionChunkCheckpoint(
      { ...job, processingRunId: runId("run-chunk") },
      chunk,
      original,
    );
    await expect(
      saveMeetingTranscriptionChunkCheckpoint(
        { ...job, processingRunId: runId("run-chunk") },
        chunk,
        {
          language: "zh",
          turns: [{ ...original.turns[0], text: "重复 delivery 的不同结果" }],
        },
      ),
    ).resolves.toEqual(original);
    await expect(loadMeetingTranscriptionChunkCheckpoint(job, chunk)).resolves.toEqual(original);
    await expect(
      loadMeetingTranscriptionChunkCheckpoint(job, { ...chunk, endMs: 31_000 }),
    ).resolves.toBeNull();
    await expect(
      loadMeetingTranscriptionChunkCheckpoint(
        { ...job, pipelineVersion: "final-v2" as never },
        chunk,
      ),
    ).resolves.toBeNull();
    await expect(
      db
        .select({ status: meetingTranscriptionChunk.status })
        .from(meetingTranscriptionChunk)
        .where(eq(meetingTranscriptionChunk.meetingId, MEETING_ID)),
    ).resolves.toEqual([{ status: "succeeded" }]);
  });

  it("materializes the Qwen ASR default policy and enqueues it when no policy exists", async () => {
    await db
      .delete(meetingTranscriptionPolicy)
      .where(eq(meetingTranscriptionPolicy.organizationId, ORGANIZATION_ID));
    process.env.MEETING_TRANSCRIPTION_QWEN_ENABLED = "true";
    try {
      await expect(
        getMeetingTranscriptionJobForMeeting({
          meetingId: MEETING_ID,
          organizationId: ORGANIZATION_ID,
        }),
      ).resolves.toMatchObject({
        meetingId: MEETING_ID,
        model: "qwen3-asr-flash-filetrans",
        policyRevision: 1,
        provider: "qwen",
        region: "qwen-cn-beijing",
        sourceManifestSha256: SOURCE_SHA,
      });
      const [row] = await db
        .select()
        .from(meetingTranscriptionPolicy)
        .where(eq(meetingTranscriptionPolicy.organizationId, ORGANIZATION_ID));
      expect(row?.selectedProvider).toBe("qwen");
      expect(row?.allowedProviders).toEqual(["qwen"]);
      expect(row?.revision).toBe(1);
    } finally {
      delete process.env.MEETING_TRANSCRIPTION_QWEN_ENABLED;
    }
  }, 30_000);
});
