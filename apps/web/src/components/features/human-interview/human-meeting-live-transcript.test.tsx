// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- The regression supplies faithful LiveKit tracks and the shared transcript port without browser media devices. */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveTranscriptDraftSnapshot } from "@app/meeting-live-transcript/draft";
import { HumanMeetingLiveTranscript } from "./human-meeting-live-transcript";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const transcript = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let snapshot: LiveTranscriptDraftSnapshot = {
    captureId: null,
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
  };
  const start = vi.fn((input: { captureId: string }) => {
    snapshot = {
      ...snapshot,
      captureId: input.captureId,
      sections: [
        {
          id: "section-1",
          sequence: 0,
          startedAt: "2026-09-01T00:00:00.000Z",
          track: "microphone",
        },
      ],
      status: "live",
      turns: [
        {
          final: true,
          id: "turn-1",
          sectionId: "section-1",
          text: "自动保存的实时字幕",
          track: "microphone",
        },
      ],
    };
    for (const listener of listeners) {
      listener();
    }
    return Promise.resolve();
  });
  return {
    draft: {
      getSnapshot: () => snapshot,
      observe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start,
      stop: vi.fn(),
    },
    reset: () => {
      start.mockClear();
      snapshot = {
        ...snapshot,
        captureId: null,
        sections: [],
        status: "idle",
        turns: [],
      };
    },
    start,
  };
});

vi.mock("@livekit/components-react", () => ({
  useTracks: () => [
    {
      participant: { isLocal: true },
      publication: { track: { mediaStreamTrack: { id: "local-track" } } },
    },
    {
      participant: { isLocal: false },
      publication: { track: { mediaStreamTrack: { id: "remote-track" } } },
    },
  ],
}));

vi.mock("@app/meeting-live-transcript/browser", () => ({
  connectHumanInterviewTranscriptRelay: vi.fn(),
  createBrowserPcmSidecar: vi.fn(),
}));

vi.mock("@app/meeting-live-transcript/draft", () => ({
  createDurableLiveTranscriptDraft: (snapshot: LiveTranscriptDraftSnapshot) =>
    snapshot.captureId
      ? {
          capturedAt: "2026-09-01T00:00:00.000Z",
          droppedAudioMs: snapshot.droppedAudioMs,
          droppedPcmFrames: snapshot.droppedPcmFrames,
          error: snapshot.error,
          sections: snapshot.sections,
          turns: snapshot.turns,
        }
      : null,
  createLiveTranscriptDraft: () => transcript.draft,
}));

vi.mock("./human-meeting-audio-mix", () => ({
  createHumanMeetingAudioMix: vi.fn((tracks: { id: string }[]) =>
    Promise.resolve({
      mediaTrack: tracks[0],
      setTracks: vi.fn(),
      stop: vi.fn(),
    }),
  ),
}));

const roots: ReturnType<typeof createRoot>[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  transcript.reset();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      Response.json(init?.method === "PUT" ? { version: 1 } : { draft: null, version: 0 }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("HumanMeetingLiveTranscript", () => {
  it("starts automatically and persists the durable draft without a start option", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => root.render(<HumanMeetingLiveTranscript inviteToken="invite-1" />));
    await flush();

    expect(transcript.start).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("开始转录");
    const panel = container.querySelector('aside[aria-label="实时转录"]');
    expect(panel).not.toBeNull();
    expect(panel?.classList.contains("absolute")).toBe(false);
    expect(panel?.classList.contains("min-h-0")).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(1600));

    const save = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(save?.[0]).toBe(
      "/api/public/human-interview-meetings/interviewer/invite-1/live-transcript-draft",
    );
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({
      draft: { turns: [{ text: "自动保存的实时字幕" }] },
      expectedVersion: 0,
    });
  });
});
