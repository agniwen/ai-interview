import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import { MeetingCaptureComposer, MeetingInterruptedComposer } from "./meeting-capture-status";

const ACTIVE_SNAPSHOT: MeetingCaptureSnapshot = {
  active: {
    captureId: "00000000-0000-4000-8000-000000000077",
    recruitingRecordId: null,
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
  it("gives the recording status breathing room from the frame edge", () => {
    const html = renderToStaticMarkup(
      <MeetingCaptureComposer
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSave={vi.fn()}
        snapshot={ACTIVE_SNAPSHOT}
      />,
    );

    expect(html).toMatch(
      /<div(?=[^>]*data-slot="meeting-recording-status")(?=[^>]*class="[^"]*pl-2)[^>]*>/,
    );
  });
});

describe("MeetingInterruptedComposer", () => {
  it("offers continuing or ending through the normal background upload path", () => {
    const html = renderToStaticMarkup(
      <MeetingInterruptedComposer onContinue={vi.fn()} onSave={vi.fn()} />,
    );

    expect(html).toContain("继续");
    expect(html).toContain("结束");
    expect(html).not.toContain("结束并上传");
    expect(html).toMatch(
      /<div(?=[^>]*data-slot="meeting-interrupted-status")(?=[^>]*class="[^"]*pl-2)[^>]*>/,
    );
  });
});
