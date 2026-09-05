import { describe, expect, it } from "vitest";
import {
  findHumanInterviewRoundMeeting,
  selectHumanInterviewTranscriptRevision,
} from "./human-interview-meeting-detail";

describe("human interview meeting selection", () => {
  const old = {
    createdAt: "2026-09-01T00:00:00Z",
    id: "old",
    rounds: [{ roundId: "round" }],
    status: "cancelled",
  };
  const current = { ...old, createdAt: "2026-09-02T00:00:00Z", id: "current", status: "ended" };
  it("opens the replacement meeting regardless of list order", () => {
    expect(findHumanInterviewRoundMeeting([old, current], "round")).toEqual(current);
    expect(findHumanInterviewRoundMeeting([current, old], "round")).toEqual(current);
    expect(
      findHumanInterviewRoundMeeting(
        [current, { ...old, createdAt: "2026-09-03T00:00:00Z" }],
        "round",
      ),
    ).toEqual(current);
  });
  it("keeps cancelled history available and never selects another round", () => {
    expect(findHumanInterviewRoundMeeting([old], "round")).toEqual(old);
    expect(findHumanInterviewRoundMeeting([current], "another-round")).toBeNull();
  });
});

describe("human interview detail transcript basis", () => {
  it("pins an existing evaluation to its source, even after a correction", () => {
    expect(
      selectHumanInterviewTranscriptRevision({
        activeRevisionId: "corrected",
        evaluationRevisionId: "source",
        evaluationStatus: "submitted",
        hasEvaluation: true,
      }),
    ).toEqual({ basis: "evaluation", revisionId: "source" });
  });
  it("labels legacy unversioned evaluations and permits transcript before evaluation", () => {
    expect(
      selectHumanInterviewTranscriptRevision({
        activeRevisionId: "current",
        evaluationRevisionId: null,
        evaluationStatus: "submitted",
        hasEvaluation: true,
      }),
    ).toEqual({ basis: "unlinked", revisionId: "current" });
    expect(
      selectHumanInterviewTranscriptRevision({
        activeRevisionId: "current",
        evaluationRevisionId: "stale",
        evaluationStatus: "generating",
        hasEvaluation: false,
      }),
    ).toEqual({ basis: "current", revisionId: "current" });
    expect(
      selectHumanInterviewTranscriptRevision({
        activeRevisionId: null,
        evaluationRevisionId: null,
        evaluationStatus: "not_started",
        hasEvaluation: false,
      }).revisionId,
    ).toBeNull();
  });
});
