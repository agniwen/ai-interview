import { describe, expect, it } from "vitest";
import { resolveReportUpdate } from "./report-policy";
const user = { message: "我负责项目交付", role: "user" as const, timeInCallSecs: 10 };
const base = {
  dataCollectionResults: {},
  metadata: { agentSessionId: "first" },
  startedAt: new Date("2026-09-11T14:29:30Z"),
  transcript: [user],
};
const incoming = {
  metadata: { agentSessionId: "first" },
  startedAt: "2026-09-11T14:29:30Z",
  transcript: [user],
};
describe("report evidence ownership", () => {
  it("archives a new agent using the same room instead of replacing evidence", () => {
    expect(
      resolveReportUpdate(base, {
        ...incoming,
        metadata: { agentSessionId: "second" },
        transcript: [],
      }).accepted,
    ).toBe(false);
  });
  it("archives legacy reports with a different start time", () => {
    expect(
      resolveReportUpdate(
        { ...base, metadata: {} },
        { ...incoming, metadata: {}, startedAt: "2026-09-14T07:37:31Z" },
      ).accepted,
    ).toBe(false);
  });
  it("does not truncate or rewrite existing turns even with the same session id", () => {
    expect(resolveReportUpdate(base, { ...incoming, transcript: [] }).accepted).toBe(false);
    expect(
      resolveReportUpdate(base, { ...incoming, transcript: [{ ...user, message: "欢迎回来" }] })
        .accepted,
    ).toBe(false);
  });
  it("accepts an exact retry and an append-only final transcript", () => {
    expect(resolveReportUpdate(base, incoming)).toMatchObject({
      accepted: true,
      transcriptChanged: false,
    });
    expect(
      resolveReportUpdate(base, {
        ...incoming,
        transcript: [user, { ...user, timeInCallSecs: 20 }],
      }),
    ).toMatchObject({ accepted: true, transcriptChanged: true });
  });
  it("preserves checkpoint evidence when a final report labels the question unasked", () => {
    const answered = {
      answerSummary: "项目交付",
      difficulty: "easy",
      endedAtSecs: 10,
      evaluationFocus: null,
      followUpCount: 0,
      followUpDirections: null,
      question: "项目",
      questionId: "q",
      reason: null,
      revision: 1,
      startedAtSecs: 0,
      status: "answered",
    };
    const existing = {
      ...base,
      dataCollectionResults: { questions: [answered], schemaVersion: 2 },
      transcript: [],
    };
    const result = resolveReportUpdate(existing, {
      ...incoming,
      dataCollectionResults: {
        questions: [
          {
            ...answered,
            answerSummary: null,
            reason: "system_shutdown",
            revision: 2,
            status: "unasked",
          },
        ],
        schemaVersion: 2,
      },
    });
    expect(result.dataCollectionResults?.questions[0]).toEqual(answered);
  });
});
