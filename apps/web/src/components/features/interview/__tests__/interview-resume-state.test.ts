import { describe, expect, it } from "vitest";
import { parseInterviewResumeState } from "../interview-resume-state";

describe("interview resume UI state", () => {
  it("restores the original clock and muted microphone together", () => {
    const state = { microphoneEnabled: false, roomName: "room-1", startedAt: 123_456 };
    expect(parseInterviewResumeState(JSON.stringify(state))).toEqual(state);
  });

  it("ignores corrupt or obsolete state", () => {
    expect(parseInterviewResumeState("broken")).toBeNull();
    expect(parseInterviewResumeState('{"startedAt":-1}')).toBeNull();
    expect(parseInterviewResumeState(null)).toBeNull();
  });
});
