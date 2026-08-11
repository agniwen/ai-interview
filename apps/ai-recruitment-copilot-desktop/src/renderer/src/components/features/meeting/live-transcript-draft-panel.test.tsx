import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LiveTranscriptDraftPanel,
  MeetingTranscriptIdleStage,
  shouldFollowLiveTranscript,
} from "./live-transcript-draft-panel";

describe("LiveTranscriptDraftPanel", () => {
  it("follows new transcript content only while the viewport is within 80px of the bottom", () => {
    expect(
      shouldFollowLiveTranscript({ clientHeight: 400, scrollHeight: 1000, scrollTop: 521 }),
    ).toBe(true);
    expect(
      shouldFollowLiveTranscript({ clientHeight: 400, scrollHeight: 1000, scrollTop: 520 }),
    ).toBe(false);
  });

  it("shows a Chinese draft label and surfaces interruption errors without stopping recording copy", () => {
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
    expect(html).toContain("草稿");
    expect(html).not.toContain("provisional");
    expect(html).toContain("实时字幕已中断，录音仍在继续");
    expect(html).toContain("约 125 ms");
    expect(html).toContain("本地录音未受影响");
  });

  it("renders transcript text without exposing audio-track labels", () => {
    const html = renderToStaticMarkup(
      <LiveTranscriptDraftPanel
        snapshot={{
          captureId: "00000000-0000-4000-8000-000000000077",
          droppedAudioMs: 0,
          droppedPcmFrames: 0,
          error: null,
          queuePeakAudioMs: 0,
          queuedAudioMs: 0,
          queuedPcmBytes: 0,
          sections: [
            {
              id: "section-microphone",
              sequence: 0,
              startedAt: "2026-08-11T12:00:00.000Z",
              track: "microphone",
            },
            {
              id: "section-system",
              sequence: 1,
              startedAt: "2026-08-11T12:00:01.000Z",
              track: "system",
            },
          ],
          status: "live",
          trackDroppedAudioMs: { microphone: 0, system: 0 },
          trackQueuePeakAudioMs: { microphone: 0, system: 0 },
          trackQueuedAudioMs: { microphone: 0, system: 0 },
          trackStatus: { microphone: "live", system: "live" },
          turns: [
            {
              final: true,
              id: "turn-microphone",
              sectionId: "section-microphone",
              text: "第一段转录",
              track: "microphone",
            },
            {
              final: true,
              id: "turn-system",
              sectionId: "section-system",
              text: "第二段转录",
              track: "system",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("第一段转录");
    expect(html).toContain("第二段转录");
    expect(html).not.toContain("我的麦克风");
    expect(html).not.toContain("系统音频");
    expect(html).not.toContain("草稿区段");
    expect(html).toContain('aria-label="实时字幕状态：实时"');
    expect(html).not.toContain(">live<");
    expect(html).toContain(
      'data-slot="scroll-area"><div class="h-full w-full min-w-0 overflow-auto scroll-fade"><div class="container mx-auto grid max-w-3xl',
    );
    expect(html).not.toContain("max-w-5xl");
  });

  it("reserves composer clearance at the end of scroll content", () => {
    const liveHtml = renderToStaticMarkup(
      <LiveTranscriptDraftPanel
        snapshot={{
          captureId: "00000000-0000-4000-8000-000000000077",
          droppedAudioMs: 0,
          droppedPcmFrames: 0,
          error: null,
          queuePeakAudioMs: 0,
          queuedAudioMs: 0,
          queuedPcmBytes: 0,
          sections: [],
          status: "live",
          trackDroppedAudioMs: { microphone: 0, system: 0 },
          trackQueuePeakAudioMs: { microphone: 0, system: 0 },
          trackQueuedAudioMs: { microphone: 0, system: 0 },
          trackStatus: { microphone: "live", system: "live" },
          turns: [
            {
              final: true,
              id: "turn-1",
              sectionId: "section-1",
              text: "最后一段转录",
              track: "microphone",
            },
          ],
        }}
      />,
    );
    const idleHtml = renderToStaticMarkup(<MeetingTranscriptIdleStage />);

    expect(liveHtml).toContain('class="container mx-auto grid max-w-3xl gap-3 px-4 pb-20 sm:px-6"');
    expect(idleHtml).toContain("pb-20");
  });
});
