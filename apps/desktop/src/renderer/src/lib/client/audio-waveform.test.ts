import { describe, expect, it } from "vitest";
import { loadWaveformPeaks, peaksFromChannelData, waveformCacheKey } from "./audio-waveform";

const rejectExtraction = (): Promise<number[]> => Promise.reject(new Error("CORS blocked"));

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

  it("does not fabricate speech peaks when the audio has no samples", () => {
    expect(peaksFromChannelData(new Float32Array(), 12)).toEqual([]);
  });

  it("returns an unavailable state without fake peaks when extraction fails", async () => {
    await expect(
      loadWaveformPeaks("https://recordings.example/meeting.webm", rejectExtraction),
    ).resolves.toEqual({
      peaks: [],
      status: "unavailable",
    });
  });
});
