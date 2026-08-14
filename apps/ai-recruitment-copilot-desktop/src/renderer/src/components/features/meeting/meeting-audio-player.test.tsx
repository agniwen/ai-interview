import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingAudioPlayer, MeetingPlaybackComposer } from "./meeting-audio-player";

describe("MeetingAudioPlayer", () => {
  it("renders a single-height bar with play, waveform, time and speed", () => {
    const html = renderToStaticMarkup(
      <MeetingAudioPlayer
        playback={{
          expiresAt: "2026-08-09T04:06:00.000Z",
          url: "https://r2.invalid/playback.webm",
        }}
      />,
    );

    expect(html).toContain('data-slot="meeting-audio-player"');
    expect(html).toContain("flex h-8 min-w-0 items-center");
    expect(html).toContain('aria-label="播放"');
    expect(html).toContain('aria-label="录音波形"');
    expect(html).toContain('aria-label="播放倍速"');
    expect(html).toContain("size-8");
  });

  it("wraps the player in the recording floating-bar chrome", () => {
    const html = renderToStaticMarkup(
      <MeetingPlaybackComposer
        playback={{
          expiresAt: "2026-08-09T04:06:00.000Z",
          url: "https://r2.invalid/playback.webm",
        }}
      />,
    );

    expect(html).toContain("rounded-md");
    expect(html).toContain('data-slot="meeting-composer-frame"');
    expect(html).toContain('data-slot="meeting-audio-player"');
  });
});
