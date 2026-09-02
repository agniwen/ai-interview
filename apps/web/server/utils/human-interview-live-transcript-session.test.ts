import { describe, expect, it, vi } from "vitest";
import { renewHumanInterviewLiveTranscriptLease } from "./human-interview-live-transcript-session";

describe("renewHumanInterviewLiveTranscriptLease", () => {
  it("closes the relay when the heartbeat rejects instead of leaking an unhandled rejection", async () => {
    const close = vi.fn();

    await expect(
      renewHumanInterviewLiveTranscriptLease({
        close,
        heartbeat: vi.fn().mockRejectedValue(new Error("database unavailable")),
      }),
    ).resolves.toBeUndefined();

    expect(close).toHaveBeenCalledWith("transcript-heartbeat-failed");
  });

  it("closes the relay when the lease no longer exists", async () => {
    const close = vi.fn();
    await renewHumanInterviewLiveTranscriptLease({
      close,
      heartbeat: vi.fn().mockResolvedValue(false),
    });
    expect(close).toHaveBeenCalledWith("transcript-lease-expired");
  });
});
