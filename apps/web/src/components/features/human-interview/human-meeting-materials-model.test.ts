import { describe, expect, it } from "vitest";
import {
  resolveEffectiveCandidateId,
  shouldReturnToMeetingForLocalScreenShare,
} from "./human-meeting-materials-model";

const candidates = [
  { candidateName: "候选人甲", id: "candidate-1", rounds: [], targetRole: null },
  { candidateName: "候选人乙", id: "candidate-2", rounds: [], targetRole: null },
];

describe("human meeting candidate materials model", () => {
  it("defaults to the first candidate and preserves an existing meeting candidate selection", () => {
    expect(resolveEffectiveCandidateId(candidates, null)).toBe("candidate-1");
    expect(resolveEffectiveCandidateId(candidates, "candidate-2")).toBe("candidate-2");
    expect(resolveEffectiveCandidateId(candidates, "outside-meeting")).toBe("candidate-1");
  });

  it("only returns to the meeting when the local interviewer starts sharing", () => {
    expect(shouldReturnToMeetingForLocalScreenShare("materials", true)).toBe(true);
    expect(shouldReturnToMeetingForLocalScreenShare("materials", false)).toBe(false);
    expect(shouldReturnToMeetingForLocalScreenShare("meeting", true)).toBe(false);
  });
});
