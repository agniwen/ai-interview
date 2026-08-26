import { describe, expect, it } from "vitest";
import { createLiveTranscriptAudio } from "./live-transcript-audio";

describe("correction audio ring", () => {
  it("returns exact completed clips once, checking original text before consuming audio", () => {
    const audio = createLiveTranscriptAudio();
    audio.appendPcm(Buffer.alloc(32_000, 1));
    audio.appendPcm(Buffer.alloc(32_000, 2));
    expect(audio.take("1", "原文")).toBeNull();
    audio.complete({ endMs: 1500, itemId: "1", startMs: 500, text: "原文" });
    expect(audio.take("1", "旧文")).toBeNull();
    expect(audio.take("1", "原文")).toEqual(
      Buffer.concat([Buffer.alloc(16_000, 1), Buffer.alloc(16_000, 2)]),
    );
    expect(audio.take("1", "原文")).toBeNull();
    audio.close();
  });
  it("rejects evicted clips but reads across the circular buffer boundary", () => {
    const audio = createLiveTranscriptAudio();
    audio.appendPcm(Buffer.alloc(90 * 32_000, 7));
    audio.appendPcm(Buffer.alloc(32_000, 8));
    audio.complete({ endMs: 1000, itemId: "old", startMs: 0, text: "旧" });
    audio.complete({ endMs: 90_500, itemId: "crossing", startMs: 89_500, text: "跨界" });
    expect(audio.take("old", "旧")).toBeNull();
    expect(audio.take("crossing", "跨界")).toEqual(
      Buffer.concat([Buffer.alloc(16_000, 7), Buffer.alloc(16_000, 8)]),
    );
    audio.close();
  });
  it("does not retain unbounded, invalid or closed-session audio", () => {
    const audio = createLiveTranscriptAudio();
    audio.appendPcm(Buffer.alloc(100 * 32_000, 9));
    audio.complete({ endMs: 90_000, itemId: "long", startMs: 0, text: "长" });
    expect(audio.take("long", "长")).toBeNull();
    audio.complete({ endMs: 100_000, itemId: "recent", startMs: 99_000, text: "近" });
    audio.close();
    expect(audio.take("recent", "近")).toBeNull();
  });
});
