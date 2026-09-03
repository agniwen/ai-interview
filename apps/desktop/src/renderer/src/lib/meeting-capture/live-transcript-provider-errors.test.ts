import { describe, expect, it } from "vitest";
import {
  LocalMeetingLiveTranscriptAuthorizationError,
  shouldReconnectMeetingLiveTranscript,
} from "./live-transcript-provider-errors";

describe("shouldReconnectMeetingLiveTranscript", () => {
  it("does not retry a deterministic local provider authorization rejection", () => {
    expect(
      shouldReconnectMeetingLiveTranscript(
        new LocalMeetingLiveTranscriptAuthorizationError(
          "Deepgram API Key 权限不足；临时 JWT 需要 Member 或更高权限",
        ),
      ),
    ).toBe(false);
  });

  it("still retries transient provider disconnects", () => {
    expect(shouldReconnectMeetingLiveTranscript(new Error("provider-disconnected"))).toBe(true);
  });
});
