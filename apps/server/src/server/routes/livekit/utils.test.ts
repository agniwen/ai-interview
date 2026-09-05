import { describe, expect, it } from "vitest";
import { TrackSource, TrackType, WebhookEvent } from "@livekit/protocol";
import { shouldStartHumanInterviewRecording } from "./utils";

describe("human interview recording triggers", () => {
  it.each(["candidate_round", "interviewer_user"])(
    "retries when %s publishes their microphone after joining",
    (identity) => {
      expect(
        shouldStartHumanInterviewRecording(
          new WebhookEvent({
            event: "track_published",
            participant: { identity },
            room: { name: "human_test" },
            track: { sid: "mic", source: TrackSource.MICROPHONE, type: TrackType.AUDIO },
          }),
        ),
      ).toBe(true);
    },
  );

  it("keeps participant joins as startup triggers", () => {
    expect(
      shouldStartHumanInterviewRecording(
        new WebhookEvent({
          event: "participant_joined",
          participant: { identity: "interviewer_user" },
          room: { name: "human_test" },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["candidate_round", TrackSource.CAMERA, TrackType.VIDEO],
    ["candidate_round", TrackSource.SCREEN_SHARE_AUDIO, TrackType.AUDIO],
    ["observer_user", TrackSource.MICROPHONE, TrackType.AUDIO],
  ])("ignores unrelated track publication: %s %s", (identity, source, type) => {
    expect(
      shouldStartHumanInterviewRecording(
        new WebhookEvent({
          event: "track_published",
          participant: { identity },
          room: { name: "human_test" },
          track: { sid: "track", source, type },
        }),
      ),
    ).toBe(false);
  });

  it("does not start recordings for non-human rooms", () => {
    expect(
      shouldStartHumanInterviewRecording(
        new WebhookEvent({
          event: "participant_joined",
          participant: { identity: "candidate_round" },
          room: { name: "ai_test" },
        }),
      ),
    ).toBe(false);
  });
});
