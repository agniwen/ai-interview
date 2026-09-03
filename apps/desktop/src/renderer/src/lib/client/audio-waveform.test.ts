import { describe, expect, it } from "vitest";
import { peaksFromChannelData, placeholderWaveform, waveformCacheKey } from "./audio-waveform";

describe("audio waveform", () => {
  it("strips signed-url query noise so refreshed playback URLs reuse one cache key", () => {
    expect(waveformCacheKey("https://cdn.example/meetings/a.webm?X-Amz-Signature=one")).toBe(
      "https://cdn.example/meetings/a.webm",
    );
    expect(waveformCacheKey("https://cdn.example/meetings/a.webm?X-Amz-Signature=two")).toBe(
      "https://cdn.example/meetings/a.webm",
    );
  });

  it("normalizes channel peaks into a visible bar envelope", () => {
    const channel = new Float32Array(1000);
    for (let index = 0; index < 200; index += 1) {
      channel[index] = 0.9;
    }
    const peaks = peaksFromChannelData(channel, 10);
    expect(peaks).toHaveLength(10);
    expect(peaks[0]).toBeGreaterThan(0.8);
    expect(peaks[9]).toBeLessThan(0.2);
  });

  it("keeps placeholder bars in a speech-like range", () => {
    const bars = placeholderWaveform(12);
    expect(bars).toHaveLength(12);
    expect(bars.every((value) => value >= 0.08 && value <= 1)).toBe(true);
  });
});
