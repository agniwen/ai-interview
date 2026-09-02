import { describe, expect, it } from "vitest";
import type { HumanInterviewMeetingTokenResponse } from "@app/shared/studio-pipeline-stages";
import {
  getHumanInterviewRecordingPollDelayMs,
  shouldPollHumanInterviewRecordingStatus,
} from "./human-meeting-recording-status";

const joinedToken: HumanInterviewMeetingTokenResponse = {
  participantName: "面试官",
  participantRole: "interviewer",
  participantToken: "joined-token",
  roomName: "human-room",
  serverUrl: "wss://livekit.invalid",
};

describe("shouldPollHumanInterviewRecordingStatus", () => {
  it("keeps polling after a transient failed status so a retry can become visible", () => {
    expect(shouldPollHumanInterviewRecordingStatus(joinedToken, "failed")).toBe(true);
  });

  it("stops only before joining or after recording completes", () => {
    expect(shouldPollHumanInterviewRecordingStatus(null, "active")).toBe(false);
    expect(shouldPollHumanInterviewRecordingStatus(joinedToken, "completed")).toBe(false);
  });

  it("backs off repeated failed recording polls and caps the delay", () => {
    expect(getHumanInterviewRecordingPollDelayMs("active", 4)).toBe(2000);
    expect(getHumanInterviewRecordingPollDelayMs("failed", 0)).toBe(4000);
    expect(getHumanInterviewRecordingPollDelayMs("failed", 10)).toBe(30_000);
  });
});
