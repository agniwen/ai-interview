import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgAsyncPreparedQuery } from "drizzle-orm/pg-core";
import { relations } from "@app/db-schema/relations";
import type { TranscriptAttribution } from "@app/db-schema/human-interview-recording";
import {
  createHumanInterviewEvaluationDao,
  createHumanInterviewEvaluationWorkerDao,
} from "./human-interview-evaluation-dao";

// SQL execution is mocked below, before the lazy driver can open a connection.
const database = drizzle("postgres://review:review@127.0.0.1:1/review", { relations });
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => database.$client.end());

describe("human interview evaluation input", () => {
  it.each([
    { method: "track", role: "candidate" },
    { method: "manual", role: "candidate" },
    { method: "track", role: "interviewer" },
    { method: "candidate-excluded", role: "interviewer" },
    { method: "unconfirmed", role: "unknown" },
  ] as const)("preserves $method/$role attribution through the worker DAO", async (identity) => {
    const attribution: TranscriptAttribution = {
      ...identity,
      excludedBySourceIds:
        identity.method === "candidate-excluded" ? ["candidate-audio"] : undefined,
      participantIdentity: "participant-1",
      sourceId: "recording-1",
    };
    const turns = [
      {
        attribution,
        id: "turn-1",
        speakerDisplayName: "候选人",
        speakerKey: "remote-1",
        text: "项目介绍",
      },
    ];
    const execute = vi.spyOn(PgAsyncPreparedQuery.prototype, "execute").mockResolvedValue([
      {
        candidateName: "测试候选人",
        internalCriteria: "五年行业经验",
        jobDescription: "岗位",
        resume: "简历",
      },
    ]);
    const dao = createHumanInterviewEvaluationWorkerDao(database, {
      loadMeetingTranscriptForEvaluation: () => Promise.resolve({ id: "revision-1", turns }),
    });
    const result = await dao.loadHumanInterviewEvaluationInput({
      meetingSessionId: "meeting-1",
      organizationId: "org-1",
      roundId: "round-1",
      transcriptRevisionId: "revision-1",
    });
    expect(result?.turns).toEqual(turns);
    expect(result?.internalCriteria).toBe("五年行业经验");
    expect(execute).toHaveBeenCalledOnce();
  });
});

describe("human interview review materials", () => {
  it("loads incomplete materials for review without declaring them ready", async () => {
    vi.spyOn(PgAsyncPreparedQuery.prototype, "execute").mockResolvedValue([
      {
        activeTranscriptRevisionId: null,
        evaluationStatus: "not_started",
        meetingSessionId: "meeting",
        recordingTracks: [],
        reviewTranscriptRevisionId: "review",
        transcriptionError: "known gap",
        transcriptionStatus: "failed",
      },
    ]);
    const load = vi.fn(() => Promise.resolve(null));
    const dao = createHumanInterviewEvaluationDao(database, {
      enqueueHumanInterviewRoundCompletion: () => Promise.resolve(),
      loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
      loadMeetingTranscriptRevision: load,
    });
    const result = await dao.loadHumanInterviewReview({
      meetingId: "human",
      organizationId: "org",
      roundId: "round",
    });
    expect(load).toHaveBeenCalledWith({
      meetingId: "meeting",
      organizationId: "org",
      revisionId: "review",
    });
    expect(result?.transcriptionState).toBe("failed");
  });
  it("removes provisional recording notices after successful recovery", async () => {
    vi.spyOn(PgAsyncPreparedQuery.prototype, "execute").mockResolvedValue([
      {
        activeTranscriptRevisionId: "active",
        meetingSessionId: "meeting",
        recordingError: "部分录音不完整",
        recordingTracks: [{ status: "failed" }],
        transcriptionError: null,
        transcriptionStatus: "ready",
      },
    ]);
    const dao = createHumanInterviewEvaluationDao(database, {
      enqueueHumanInterviewRoundCompletion: () => Promise.resolve(),
      loadMeetingTranscriptForEvaluation: () => Promise.resolve(null),
    });
    const result = await dao.loadHumanInterviewReview({
      meetingId: "human",
      organizationId: "org",
      roundId: "round",
    });
    expect(result?.recordingNotice).toBeNull();
    expect(result?.transcriptionError).toBeNull();
  });
});
