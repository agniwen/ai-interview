import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgAsyncPreparedQuery } from "drizzle-orm/pg-core";
import { relations } from "@app/db-schema/relations";
import type { TranscriptAttribution } from "@app/db-schema/human-interview-recording";
import { createHumanInterviewEvaluationWorkerDao } from "./human-interview-evaluation-dao";

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
    const execute = vi
      .spyOn(PgAsyncPreparedQuery.prototype, "execute")
      .mockResolvedValue([{ candidateName: "测试候选人", jobDescription: "岗位", resume: "简历" }]);
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
    expect(execute).toHaveBeenCalledOnce();
  });
});
