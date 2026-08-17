import { describe, expect, it, vi } from "vitest";
import { createCapturePreviewAudioTrack } from "./meeting-capture-status";

function createMediaTrack(
  overrides: {
    clone?: () => MediaStreamTrack;
    stop?: () => void;
  } = {},
): MediaStreamTrack {
  return {
    addEventListener: vi.fn(),
    applyConstraints: vi.fn(async () => {}),
    clone: overrides.clone ?? (() => createMediaTrack()),
    contentHint: "",
    dispatchEvent: vi.fn(() => true),
    enabled: true,
    getCapabilities: vi.fn(() => ({})),
    getConstraints: vi.fn(() => ({})),
    getSettings: vi.fn(() => ({})),
    id: "test-track",
    kind: "audio",
    label: "test track",
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
    readyState: "live",
    removeEventListener: vi.fn(),
    stop: overrides.stop ?? vi.fn(),
  };
}

describe("capture preview audio track ownership", () => {
  it("does not stop the recording source when the visualizer is disposed during navigation", () => {
    const stop = vi.fn();
    const cloneStop = vi.fn();
    const clonedTrack = createMediaTrack({ stop: cloneStop });
    const sourceTrack = createMediaTrack({ clone: () => clonedTrack, stop });

    const visualizerTrack = createCapturePreviewAudioTrack(sourceTrack, (track) => ({
      stop: () => track.stop(),
    }));
    visualizerTrack.stop();

    expect(stop).not.toHaveBeenCalled();
    expect(cloneStop).toHaveBeenCalledOnce();
  });
});
