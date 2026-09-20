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

  it.each(["pending", "processing", "failed"])(
    "allows manual evaluation against the current review transcript while transcription is %s",
    (transcriptionStatus) => {
      expect(
        isHumanInterviewEvaluationSubmissionCurrent(
          {
            activeTranscriptRevisionId: null,
            reviewTranscriptRevisionId: "review-current",
            transcriptionStatus,
          },
          "review-current",
        ),
      ).toBe(true);
    },
  );

  it("rejects a review transcript replaced by recovery or a newer review", () => {
    for (const activeTranscriptRevisionId of [null, "recovered-current"]) {
      expect(
        isHumanInterviewEvaluationSubmissionCurrent(
          {
            activeTranscriptRevisionId,
            reviewTranscriptRevisionId: "review-new",
            transcriptionStatus: activeTranscriptRevisionId ? "ready" : "failed",
          },
          "review-old",
        ),
      ).toBe(false);
    }
    expect(
      isHumanInterviewEvaluationSubmissionCurrent(
        {
          activeTranscriptRevisionId: "recovered-current",
          reviewTranscriptRevisionId: "review-current",
          transcriptionStatus: "ready",
        },
        "review-current",
      ),
    ).toBe(false);
  });
});
