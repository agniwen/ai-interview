import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";

describe("LiveTranscriptDraftPanel", () => {
  it("shows provisional label and surfaces interruption errors without stopping recording copy", () => {
    const html = renderToStaticMarkup(
      <LiveTranscriptDraftPanel
        snapshot={{
          captureId: "00000000-0000-4000-8000-000000000077",
          droppedAudioMs: 125,
          droppedPcmFrames: 1,
          error: "实时字幕已中断，录音仍在继续",
          queuePeakAudioMs: 0,
          queuedAudioMs: 0,
          queuedPcmBytes: 0,
          sections: [],
          status: "interrupted",
          trackDroppedAudioMs: { microphone: 125, system: 0 },
          trackQueuePeakAudioMs: { microphone: 0, system: 0 },
          trackQueuedAudioMs: { microphone: 0, system: 0 },
          trackStatus: { microphone: "interrupted", system: "live" },
          turns: [],
        }}
      />,
    );

    expect(html).toContain("实时字幕");
    expect(html).toContain("provisional");
    expect(html).toContain("实时字幕已中断，录音仍在继续");
    expect(html).toContain("约 125 ms");
    expect(html).toContain("本地录音未受影响");
  });
});
