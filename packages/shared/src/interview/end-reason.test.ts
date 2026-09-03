import { describe, expect, it } from "vitest";
import {
  INTERVIEW_END_REASON,
  mergeInterviewEndReasonMetadata,
  readInterviewEndReason,
} from "./end-reason";

describe("interview end reason metadata", () => {
  it("reads a trimmed business close reason", () => {
    expect(readInterviewEndReason({ closeReason: "  task_completed  " })).toBe("task_completed");
    expect(readInterviewEndReason({ closeReason: 42 })).toBeNull();
    expect(readInterviewEndReason({})).toBeNull();
  });

  it("preserves an explicit candidate button click over a later disconnect report", () => {
    expect(
      mergeInterviewEndReasonMetadata(
        {
          closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END,
          source: "candidate-ui",
        },
        {
          closeReason: "reconnect_grace_expired",
          livekitCloseReason: "participant_disconnected",
        },
      ),
    ).toEqual({
      closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END,
      livekitCloseReason: "participant_disconnected",
      source: "candidate-ui",
    });
  });

  it("uses the Agent business reason when no explicit button reason exists", () => {
    expect(
      mergeInterviewEndReasonMetadata(
        { closeReason: "user_initiated", roomName: "room-1" },
        { closeReason: "candidate_ended_round", livekitCloseReason: "user_initiated" },
      ),
    ).toEqual({
      closeReason: "candidate_ended_round",
      livekitCloseReason: "user_initiated",
      roomName: "room-1",
    });
  });
});
