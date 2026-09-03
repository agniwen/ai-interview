import { describe, expect, it } from "vitest";
import {
  isHumanInterviewEvaluationPublishCurrent,
  isHumanInterviewEvaluationSubmissionCurrent,
} from "./human-interview-evaluation-state";

describe("human interview evaluation state", () => {
  it("rejects an AI result after the active transcript revision changes", () => {
    expect(
      isHumanInterviewEvaluationPublishCurrent(
        {
          activeTranscriptRevisionId: "revision-new",
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: "revision-old",
        },
        "revision-old",
      ),
    ).toBe(false);
    expect(
      isHumanInterviewEvaluationPublishCurrent(
        {
          activeTranscriptRevisionId: "revision-current",
          evaluationStatus: "generating",
          evaluationTranscriptRevisionId: "revision-current",
        },
        "revision-current",
      ),
    ).toBe(true);
  });

  it("rejects a human submission after the active transcript revision changes", () => {
    expect(isHumanInterviewEvaluationSubmissionCurrent(null, null)).toBe(true);
    expect(
      isHumanInterviewEvaluationSubmissionCurrent(
        {
          activeTranscriptRevisionId: "revision-new",
          transcriptionStatus: "ready",
        },
        "revision-old",
      ),
    ).toBe(false);
    expect(
      isHumanInterviewEvaluationSubmissionCurrent(
        {
          activeTranscriptRevisionId: "revision-current",
          transcriptionStatus: "ready",
        },
        "revision-current",
      ),
    ).toBe(true);
  });
});
