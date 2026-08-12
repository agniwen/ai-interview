import { describe, expect, it, vi } from "vitest";
import { createCapturePreviewAudioTrack } from "./meeting-capture-status";

vi.mock("livekit-client", () => ({
  LocalAudioTrack: class {
    private readonly mediaTrack: MediaStreamTrack;

    constructor(mediaTrack: MediaStreamTrack) {
      this.mediaTrack = mediaTrack;
    }

    stop() {
      this.mediaTrack.stop();
    }
  },
}));

describe("capture preview audio track ownership", () => {
  it("does not stop the recording source when the visualizer is disposed during navigation", () => {
    const stop = vi.fn();
    const cloneStop = vi.fn();
    const clonedTrack = { stop: cloneStop } as unknown as MediaStreamTrack;
    const sourceTrack = {
      addEventListener: vi.fn(),
      clone: vi.fn(() => clonedTrack),
      getSettings: vi.fn(() => ({})),
      kind: "audio",
      readyState: "live",
      removeEventListener: vi.fn(),
      stop,
    } as unknown as MediaStreamTrack;

    const visualizerTrack = createCapturePreviewAudioTrack(sourceTrack);
    visualizerTrack.stop();

    expect(stop).not.toHaveBeenCalled();
    expect(cloneStop).toHaveBeenCalledOnce();
  });
});
