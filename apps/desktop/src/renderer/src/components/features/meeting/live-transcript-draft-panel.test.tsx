// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftTurn,
} from "@/lib/meeting-capture/live-transcript-draft";
import {
  LiveTranscriptDraftPanel,
  MeetingTranscriptIdleStage,
  shouldFollowLiveTranscript,
} from "./live-transcript-draft-panel";
import { playTranscriptCorrectionSweep } from "./live-transcript-correction-sweep";

const glimm = {
  cancel: vi.fn(),
  createShader: vi.fn(),
  destroy: vi.fn(),
  loseContext: vi.fn(),
  playSweep: vi.fn(),
};
const playCorrectionSweep = (block: HTMLElement) => playTranscriptCorrectionSweep(block, glimm);

describe("LiveTranscriptDraftPanel", () => {
  it("places the recording title above the shared draft badge", () => {
    const html = renderToStaticMarkup(
      <LiveTranscriptDraftPanel
        header={<h1>回忆裂缝中未曾消失的你</h1>}
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
          turns: [],
        }}
      />,
    );

    expect(html.indexOf("回忆裂缝中未曾消失的你")).toBeLessThan(html.indexOf("录制草稿"));
    expect(html.match(/录制草稿/g)).toHaveLength(1);
  });

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
    expect(html).toContain("已中断");
    expect(html).not.toContain("provisional");
    expect(html).not.toContain(">interrupted<");
    expect(html).toContain("实时字幕已中断，录音仍在继续");
    expect(html).toContain("约 125 ms");
    expect(html).toContain("本地录音未受影响");
  });

  it("renders Chinese connection labels and hides them for a saved idle draft", () => {
    const starting = renderToStaticMarkup(
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
          status: "starting",
          trackDroppedAudioMs: { microphone: 0, system: 0 },
          trackQueuePeakAudioMs: { microphone: 0, system: 0 },
          trackQueuedAudioMs: { microphone: 0, system: 0 },
          trackStatus: { microphone: "starting", system: "starting" },
          turns: [],
        }}
      />,
    );
    const saved = renderToStaticMarkup(
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
          status: "idle",
          trackDroppedAudioMs: { microphone: 0, system: 0 },
          trackQueuePeakAudioMs: { microphone: 0, system: 0 },
          trackQueuedAudioMs: { microphone: 0, system: 0 },
          trackStatus: { microphone: "idle", system: "idle" },
          turns: [],
        }}
      />,
    );

    expect(starting).toContain("启动中");
    expect(starting).not.toContain(">starting<");
    expect(saved).toContain("草稿");
    expect(saved).not.toContain("启动中");
    expect(saved).not.toContain("已中断");
    expect(saved).not.toContain("interrupted");
  });

  it.each([false, true])(
    "marks only correcting sentences in the transcript (embedded: %s)",
    (embedded) => {
      const html = renderToStaticMarkup(
        <LiveTranscriptDraftPanel
          embedded={embedded}
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
                correcting: true,
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
      expect(html.match(/未知说话人/g)).toHaveLength(2);
      expect(html.match(/data-meeting-speaker-avatar=/g)).toHaveLength(2);
      expect(html).not.toContain("说话人A");
      expect(html).not.toContain("说话人B");
      expect(html.match(/aria-label="AI 正在校正"/g)).toHaveLength(1);
      expect(html).not.toContain("我的麦克风");
      expect(html).not.toContain("系统音频");
      expect(html).not.toContain("草稿区段");
      if (!embedded) {
        expect(html).toContain('aria-label="实时字幕状态：实时"');
        expect(html).toContain('data-slot="live-transcript-scroll-content"');
        expect(html).toMatch(
          /<div(?=[^>]*data-slot="live-transcript-scroll-content")(?=[^>]*class="[^"]*grid)(?=[^>]*class="[^"]*max-w-3xl)(?=[^>]*class="[^"]*select-text)[^>]*>/,
        );
      }
      expect(html).not.toContain(">live<");
      expect(html).toContain("cursor-text");
      expect(html).not.toContain("hover:bg-foreground/4");
      expect(html).not.toContain("hover-card");
      expect(html).toContain("px-px");
      expect(html).toContain("py-1");
      expect(html.match(/w-4 shrink-0 select-none/g)).toHaveLength(1);
      expect(html).not.toContain("max-w-5xl");
    },
  );

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

    expect(liveHtml).toMatch(
      /<div(?=[^>]*data-slot="live-transcript-scroll-content")(?=[^>]*class="[^"]*max-w-3xl)(?=[^>]*class="[^"]*pb-20)[^>]*>/,
    );
    expect(liveHtml).not.toContain("AI 正在校正");
    expect(idleHtml).toContain("pb-20");
  });
});

describe("live correction block sweep", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const realtime: LiveTranscriptDraftTurn = {
    final: true,
    id: "mic:1",
    sectionId: "mic",
    text: "库伯内提斯",
    track: "microphone",
  };
  const corrected: LiveTranscriptDraftTurn = {
    ...realtime,
    correctionModel: "qwen-audio-3.0-asr-flash",
    originalText: realtime.text,
    text: "Kubernetes",
  };
  const other: LiveTranscriptDraftTurn = {
    final: true,
    id: "system:1",
    sectionId: "system",
    text: "另一段字幕",
    track: "system",
  };

  function renderTurn(turn: LiveTranscriptDraftTurn, key = "live") {
    const snapshot: LiveTranscriptDraftSnapshot = {
      captureId: "capture",
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
      turns: [turn, other],
    };
    act(() =>
      root.render(
        <StrictMode>
          <LiveTranscriptDraftPanel
            embedded
            key={key}
            playCorrectionSweep={playCorrectionSweep}
            snapshot={snapshot}
          />
        </StrictMode>,
      ),
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    const context: Pick<WebGLRenderingContext, "getExtension"> = {
      getExtension: vi.fn().mockReturnValue({ loseContext: glimm.loseContext }),
    };
    // SAFETY: The adapter only queries this extension; shader rendering is injected separately.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as WebGLRenderingContext,
    );
    glimm.createShader.mockReturnValue({ destroy: glimm.destroy });
    glimm.playSweep.mockReturnValue({ cancel: glimm.cancel });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sweeps only the changed sentence once, then frees the canvas and GPU context", () => {
    renderTurn(realtime);
    expect(container.querySelector('output[aria-label="AI 正在校正"]')).toBeNull();
    renderTurn({ ...realtime, correcting: true });
    expect(container.querySelector('output[aria-label="AI 正在校正"]')).not.toBeNull();
    expect(glimm.playSweep).not.toHaveBeenCalled();
    // The star must already be gone, and the replacement text committed, when the sweep starts.
    glimm.createShader.mockImplementationOnce(() => {
      expect(container.querySelector('output[aria-label="AI 正在校正"]')).toBeNull();
      expect(container.querySelector('[data-live-transcript-turn="mic:1"]')?.textContent).toContain(
        "Kubernetes",
      );
      return { destroy: glimm.destroy };
    });
    renderTurn(corrected);
    expect(glimm.playSweep).toHaveBeenCalledOnce();
    const canvas = container.querySelector("canvas");
    expect(canvas?.parentElement?.textContent).toContain("Kubernetes");
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
    expect(canvas?.getAttribute("aria-hidden")).toBe("true");
    renderTurn({ ...corrected, correcting: false });
    expect(glimm.playSweep).toHaveBeenCalledOnce();

    act(() => glimm.playSweep.mock.calls[0][1].onComplete());
    expect(container.querySelector("canvas")).toBeNull();
    expect(glimm.cancel).toHaveBeenCalledOnce();
    expect(glimm.destroy).toHaveBeenCalledOnce();
    expect(glimm.loseContext).toHaveBeenCalledOnce();
    renderTurn(corrected, "remounted");
    expect(glimm.playSweep).toHaveBeenCalledOnce();
    expect(glimm.destroy).toHaveBeenCalledOnce();
  });

  it("does not sweep failed corrections or saved history", () => {
    renderTurn({ ...realtime, correcting: true });
    renderTurn({ ...realtime, correcting: false });
    expect(container.querySelector('output[aria-label="AI 正在校正"]')).toBeNull();
    expect(glimm.playSweep).not.toHaveBeenCalled();
    renderTurn(corrected, "saved-history");
    expect(glimm.createShader).not.toHaveBeenCalled();
  });

  it("also plays completion feedback once when the model confirms the original text", () => {
    renderTurn({ ...realtime, correcting: true });
    renderTurn({ ...corrected, text: realtime.text });
    expect(container.querySelector('output[aria-label="AI 正在校正"]')).toBeNull();
    expect(glimm.playSweep).toHaveBeenCalledOnce();
    renderTurn({ ...corrected, text: realtime.text });
    expect(glimm.playSweep).toHaveBeenCalledOnce();
  });

  it("keeps speakers unknown until diarization without correction hover details", () => {
    renderTurn(corrected);
    expect(container.querySelector('[data-live-transcript-turn="mic:1"]')?.textContent).toContain(
      "未知说话人",
    );
    expect(
      container.querySelector('[data-live-transcript-turn="system:1"]')?.textContent,
    ).toContain("未知说话人");
    expect(document.body.querySelectorAll("[data-meeting-speaker-avatar]")).toHaveLength(2);
    expect(document.body.querySelector('[data-slot="hover-card-content"]')).toBeNull();
  });

  it("respects reduced motion without delaying corrected text", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    renderTurn(realtime);
    renderTurn(corrected);
    expect(glimm.createShader).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Kubernetes");
  });

  it.each(["unavailable", "throws"])("keeps text usable when WebGL %s", (failure) => {
    glimm.createShader.mockImplementationOnce(() => {
      if (failure === "throws") {
        throw new Error("GPU unavailable");
      }
      return null;
    });
    renderTurn(realtime);
    renderTurn(corrected);
    expect(container.textContent).toContain("Kubernetes");
    expect(container.querySelector("canvas")).toBeNull();
    expect(glimm.playSweep).not.toHaveBeenCalled();
  });

  it("cancels an unfinished sweep when its block unmounts", () => {
    renderTurn(realtime);
    renderTurn(corrected);
    renderTurn(corrected, "replacement");
    expect(glimm.cancel).toHaveBeenCalledOnce();
    expect(glimm.destroy).toHaveBeenCalledOnce();
    expect(glimm.loseContext).toHaveBeenCalledOnce();
    expect(container.querySelector("canvas")).toBeNull();
  });
});
