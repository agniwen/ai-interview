import { describe, expect, it } from "vitest";
import type { MeetingTranscriptionProviderCandidate } from "@app/shared/meeting-transcription";
import { resolveMeetingTranscriptionProviderModel } from "./meeting-transcription-provider-registry";

const qwenCandidate: MeetingTranscriptionProviderCandidate = {
  id: "qwen",
  label: "Qwen",
  model: "qwen3-asr-flash-filetrans",
  region: "qwen-cn-beijing",
};

describe("resolveMeetingTranscriptionProviderModel", () => {
  it.each(["mixed", "playback", "system"] as const)(
    "uses Qwen Audio 3 speaker diarization for a ready %s track",
    (track) => {
      expect(
        resolveMeetingTranscriptionProviderModel(qwenCandidate, [{ status: "ready", track }]),
      ).toBe("qwen-audio-3.0-asr-flash-filetrans");
    },
  );

  it("keeps the default model when only a microphone track is ready", () => {
    expect(
      resolveMeetingTranscriptionProviderModel(qwenCandidate, [
        { status: "ready", track: "microphone" },
      ]),
    ).toBe("qwen3-asr-flash-filetrans");
  });
});
