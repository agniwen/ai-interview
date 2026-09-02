// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import { MeetingCaptureComposer, MeetingInterruptedComposer } from "./meeting-capture-status";

const ACTIVE_SNAPSHOT: MeetingCaptureSnapshot = {
  active: {
    captureId: "00000000-0000-4000-8000-000000000077",
    elapsedMs: 0,
    recruitingRecordId: null,
    resumedAt: "2026-08-28T00:00:00.000Z",
    startedAt: "2026-08-28T00:00:00.000Z",
    tracks: {
      microphone: { health: "healthy", level: 0 },
      system: { health: "healthy", level: 0 },
    },
    videoTracksPersisted: 0,
  },
  error: null,
  localSessions: [],
  phase: "active",
  recoverable: [],
  recoveryComplete: true,
  saved: null,
  workspaceSaves: [],
};

describe("MeetingCaptureComposer", () => {
  it("shows one combined waveform without microphone selection", () => {
    const html = renderToStaticMarkup(
      <MeetingCaptureComposer
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSave={vi.fn()}
        snapshot={ACTIVE_SNAPSHOT}
      />,
    );

    expect(html.match(/data-slot="meeting-combined-audio-visualizer"/g)).toHaveLength(1);
    expect(html.match(/data-lk-index=/g)).toHaveLength(80);
    expect(html).not.toContain("meeting-microphone-source");
    expect(html).not.toContain("meeting-microphone-selector");
    expect(html).not.toContain('data-slot="meeting-composer-frame"');
    expect(html).toContain("duration-[80ms]");
  });

  it("uses icon-only pill controls for pause and stop", () => {
    const html = renderToStaticMarkup(
      <MeetingCaptureComposer
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSave={vi.fn()}
        snapshot={ACTIVE_SNAPSHOT}
      />,
    );

    expect(html).toContain('aria-label="暂停录制"');
    expect(html).toContain('aria-label="结束并保存录制"');
    expect(html).toContain("w-[4.8rem] rounded-full");
    expect(html).toContain("w-[3.2rem] justify-self-end rounded-full");
    expect(html).toContain("h-12 w-full min-w-0");
  });

  it("turns the center action into continue while paused", () => {
    const html = renderToStaticMarkup(
      <MeetingCaptureComposer
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSave={vi.fn()}
        snapshot={{ ...ACTIVE_SNAPSHOT, phase: "paused" }}
      />,
    );

    expect(html).toContain('aria-label="继续录制"');
  });

  it("locks the center action while a pause transition is in flight", () => {
    const html = renderToStaticMarkup(
      <MeetingCaptureComposer
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSave={vi.fn()}
        snapshot={{ ...ACTIVE_SNAPSHOT, phase: "pausing" }}
      />,
    );

    expect(html).toContain('aria-label="正在暂停录制"');
    expect(html).toContain("disabled");
  });

  it("freezes the displayed recording time while paused", () => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.setSystemTime(new Date("2026-08-28T00:00:03.000Z"));
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <MeetingCaptureComposer
          onPause={vi.fn()}
          onResume={vi.fn()}
          onSave={vi.fn()}
          snapshot={{
            ...ACTIVE_SNAPSHOT,
            active: ACTIVE_SNAPSHOT.active
              ? { ...ACTIVE_SNAPSHOT.active, elapsedMs: 3000, resumedAt: null }
              : null,
            phase: "paused",
          }}
        />,
      );
    });
    expect(
      container.querySelector('[data-slot="meeting-recording-status"]')?.textContent,
    ).toContain("00:03");

    act(() => vi.advanceTimersByTime(2000));

    expect(
      container.querySelector('[data-slot="meeting-recording-status"]')?.textContent,
    ).toContain("00:03");

    act(() => {
      root.render(
        <MeetingCaptureComposer
          onPause={vi.fn()}
          onResume={vi.fn()}
          onSave={vi.fn()}
          snapshot={{
            ...ACTIVE_SNAPSHOT,
            active: ACTIVE_SNAPSHOT.active
              ? {
                  ...ACTIVE_SNAPSHOT.active,
                  elapsedMs: 3000,
                  resumedAt: "2026-08-28T00:00:05.000Z",
                }
              : null,
          }}
        />,
      );
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(
      container.querySelector('[data-slot="meeting-recording-status"]')?.textContent,
    ).toContain("00:05");
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});

describe("MeetingInterruptedComposer", () => {
  it("uses the same waveform and icon-only controls as active recording", () => {
    const html = renderToStaticMarkup(
      <MeetingInterruptedComposer onContinue={vi.fn()} onSave={vi.fn()} />,
    );

    expect(html).toContain('data-slot="meeting-interrupted-composer"');
    expect(html).toContain('data-slot="meeting-combined-audio-visualizer"');
    expect(html).toContain('aria-label="继续录制"');
    expect(html).toContain('aria-label="结束并保存录制"');
    expect(html).toContain("bg-primary/10 text-primary");
    expect(html).toContain("w-[3.2rem] justify-self-end rounded-full");
    expect(html).not.toContain('data-slot="meeting-composer-frame"');
    expect(html).not.toContain("结束并上传");
    expect(html).toMatch(
      /<div(?=[^>]*data-slot="meeting-interrupted-status")(?=[^>]*class="[^"]*pl-1)[^>]*>/,
    );
  });
});
