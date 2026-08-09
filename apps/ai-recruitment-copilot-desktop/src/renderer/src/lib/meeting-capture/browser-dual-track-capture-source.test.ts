// oxlint-disable class-methods-use-this, max-classes-per-file, require-await, typescript/no-this-alias, typescript/parameter-properties, unicorn/consistent-function-scoping, unicorn/no-this-assignment -- Browser media fakes intentionally mirror constructable DOM classes and callback APIs.
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
    vi.restoreAllMocks();
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

  it("keeps both recording tracks advancing when the live draft sidecar fails", async () => {
    const recorders: {
      emit: (event: BlobEvent) => void;
      state: RecordingState;
      stop: () => void;
    }[] = [];
    class FakeMediaRecorder {
      state: RecordingState = "inactive";
      private readonly listeners = new Map<string, ((event: BlobEvent) => void)[]>();

      constructor() {
        const recorder = this;
        recorders.push({
          emit: (event) => {
            for (const listener of this.listeners.get("dataavailable") ?? []) {
              listener(event);
            }
          },
          get state() {
            return recorder.state;
          },
          stop: () => this.stop(),
        });
      }

      static isTypeSupported() {
        return true;
      }

      addEventListener(type: string, listener: (event: BlobEvent) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
      }
    }
    const createAudioTrack = () => ({ addEventListener: vi.fn(), stop: vi.fn() });
    const microphoneTrack = createAudioTrack();
    const systemTrack = createAudioTrack();
    stubMediaDevices({
      display: Promise.resolve({
        getAudioTracks: () => [systemTrack],
        getTracks: () => [systemTrack],
        getVideoTracks: () => [],
      } as unknown as MediaStream),
      microphone: Promise.resolve({
        getAudioTracks: () => [microphoneTrack],
        getTracks: () => [microphoneTrack],
        getVideoTracks: () => [],
      } as unknown as MediaStream),
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    vi.stubGlobal(
      "MediaStream",
      class {
        constructor(readonly tracks: MediaStreamTrack[]) {}
      },
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        createAnalyser() {
          return { fftSize: 0, getFloatTimeDomainData: vi.fn() };
        }
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: vi.fn() };
        }
        close() {
          return Promise.resolve();
        }
      },
    );
    vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(15_000);
    const sidecar = {
      start: vi.fn().mockRejectedValue(new Error("provider disconnected")),
      stop: vi.fn(),
    };
    const prepared = await new BrowserDualTrackCaptureSource(sidecar).acquire();
    const committed = { microphone: 0, system: 0 };
    const failure = vi.fn();
    await prepared.start(
      {
        failure,
        fragment: async (fragment) => {
          committed[fragment.track] = fragment.endedAtMonotonicMs;
        },
        level: vi.fn(),
        status: vi.fn(),
      },
      { captureId: "00000000-0000-4000-8000-000000000077" },
    );
    recorders[0]?.emit({ data: new Blob(["mic"]) } as BlobEvent);
    recorders[1]?.emit({ data: new Blob(["system"]) } as BlobEvent);
    await vi.waitFor(() => expect(committed).toEqual({ microphone: 15_000, system: 15_000 }));

    expect(failure).not.toHaveBeenCalled();
    expect(sidecar.start).toHaveBeenCalledOnce();
  });
});
