import { describe, expect, it, vi } from "vitest";
import type { MeetingLiveTranscriptAuthorization } from "@app/shared/meeting-transcription";
import {
  createLiveTranscriptAuthorizationGate,
  LiveTranscriptAuthorizationRateLimitError,
  resolveMeetingLiveTranscriptConcurrency,
} from "./authorization-gate";

const authorization = (capture: number): MeetingLiveTranscriptAuthorization => ({
  clientSecret: `ephemeral-${capture}`,
  expiresAt: "2026-08-09T02:01:00.000Z",
  model: "gpt-4o-mini-transcribe",
  provider: "openai",
  track: "microphone",
});

describe("live transcript authorization gate", () => {
  it("defaults live draft concurrency to 100 sessions", () => {
    expect(resolveMeetingLiveTranscriptConcurrency({})).toBe(100);
    expect(
      resolveMeetingLiveTranscriptConcurrency({ MEETING_LIVE_TRANSCRIPT_CONCURRENCY: "8" }),
    ).toBe(8);
  });

  it("deduplicates concurrent requests and limits each capture-track grant window", async () => {
    const mint = vi.fn(async () => {
      await Promise.resolve();
      return authorization(1);
    });
    const gate = createLiveTranscriptAuthorizationGate({
      maxGrantsPerCaptureTrack: 1,
      now: () => Date.parse("2026-08-09T02:00:00.000Z"),
    });
    const input = {
      captureId: "00000000-0000-4000-8000-000000000077",
      organizationId: "org-77",
      track: "microphone" as const,
      userId: "user-77",
    };

    const [first, second] = await Promise.all([gate.issue(input, mint), gate.issue(input, mint)]);

    expect(first).toEqual(second);
    expect(mint).toHaveBeenCalledOnce();
    await expect(gate.issue(input, mint)).rejects.toBeInstanceOf(
      LiveTranscriptAuthorizationRateLimitError,
    );
  });

  it("limits distinct authorization grants per member and resets after the window", async () => {
    let now = Date.parse("2026-08-09T02:00:00.000Z");
    const gate = createLiveTranscriptAuthorizationGate({
      maxGrantsPerUser: 2,
      now: () => now,
      windowMs: 60_000,
    });
    const issue = (capture: number) =>
      gate.issue(
        {
          captureId: `00000000-0000-4000-8000-${capture.toString().padStart(12, "0")}`,
          organizationId: "org-77",
          track: "microphone",
          userId: "user-77",
        },
        () => Promise.resolve(authorization(capture)),
      );

    await issue(1);
    await issue(2);
    await expect(issue(3)).rejects.toBeInstanceOf(LiveTranscriptAuthorizationRateLimitError);

    now += 60_000;
    await expect(issue(3)).resolves.toMatchObject({ clientSecret: "ephemeral-3" });
  });
});
