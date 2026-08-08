import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserDualTrackCaptureSource } from "./browser-dual-track-capture-source";

function fakeStream({
  audioStops = [],
  videoStops = [],
}: {
  audioStops?: ReturnType<typeof vi.fn>[];
  videoStops?: ReturnType<typeof vi.fn>[];
}): MediaStream {
  const audioTracks = audioStops.map((stop) => ({ stop }));
  const videoTracks = videoStops.map((stop) => ({ stop }));
  return {
    getAudioTracks: () => audioTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
    getVideoTracks: () => videoTracks,
  } as unknown as MediaStream;
}

function stubMediaDevices({
  display,
  microphone,
}: {
  display: Promise<MediaStream>;
  microphone: Promise<MediaStream>;
}): void {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getDisplayMedia: () => display,
      getUserMedia: () => microphone,
    },
  });
}

describe("BrowserDualTrackCaptureSource acquisition cleanup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stops display video immediately while microphone permission is still pending", async () => {
    const microphone = Promise.withResolvers<MediaStream>();
    const systemAudioStop = vi.fn();
    const videoStop = vi.fn();
    stubMediaDevices({
      display: Promise.resolve(
        fakeStream({ audioStops: [systemAudioStop], videoStops: [videoStop] }),
      ),
      microphone: microphone.promise,
    });

    const acquisition = new BrowserDualTrackCaptureSource().acquire();
    await vi.waitFor(() => expect(videoStop).toHaveBeenCalledOnce());
    microphone.reject(new DOMException("denied", "NotAllowedError"));

    await expect(acquisition).rejects.toThrow("权限被拒绝");
    expect(systemAudioStop).toHaveBeenCalledOnce();
  });

  it("stops an acquired microphone when display capture rejects", async () => {
    const microphoneStop = vi.fn();
    stubMediaDevices({
      display: Promise.reject(new DOMException("denied", "NotAllowedError")),
      microphone: Promise.resolve(fakeStream({ audioStops: [microphoneStop] })),
    });

    await expect(new BrowserDualTrackCaptureSource().acquire()).rejects.toThrow("权限被拒绝");
    expect(microphoneStop).toHaveBeenCalledOnce();
  });
});
