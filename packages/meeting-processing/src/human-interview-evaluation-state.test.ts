import { describe, expect, it } from "vitest";
import {
  canSaveHumanInterviewEvaluationDraft,
  isHumanInterviewEvaluationPublishCurrent,
  isHumanInterviewEvaluationSubmissionCurrent,
} from "./human-interview-evaluation-state";

describe("human interview evaluation state", () => {
  it("requires the ready final transcript before a human draft can be saved", () => {
    expect(
      canSaveHumanInterviewEvaluationDraft({
        meetingSessionId: null,
        transcript: null,
        transcriptionState: "pending",
      }),
    ).toBe(false);
    expect(
      canSaveHumanInterviewEvaluationDraft({
        meetingSessionId: "meeting-session-current",
        transcript: { id: "revision-current" },
        transcriptionState: "ready",
      }),
    ).toBe(true);
  });

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
