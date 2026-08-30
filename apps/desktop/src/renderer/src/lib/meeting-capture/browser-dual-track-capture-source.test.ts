// oxlint-disable class-methods-use-this, max-classes-per-file, require-await, typescript/no-this-alias, typescript/parameter-properties, unicorn/consistent-function-scoping, unicorn/no-this-assignment -- Browser media fakes intentionally mirror constructable DOM classes and callback APIs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserDualTrackCaptureSource } from "./browser-dual-track-capture-source";

interface FakeMediaTrack {
  addEventListener: (type: string, listener: () => void) => void;
  applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
  clone?: () => FakeMediaTrack;
  stop: () => void;
}

interface FakeMediaStream {
  getAudioTracks: () => FakeMediaTrack[];
  getTracks: () => FakeMediaTrack[];
  getVideoTracks: () => FakeMediaTrack[];
}

function fakeStream({
  audioStops = [],
  videoStops = [],
}: {
  audioStops?: (() => void)[];
  videoStops?: (() => void)[];
}): FakeMediaStream {
  const audioTracks = audioStops.map((stopMock) => ({
    addEventListener: vi.fn(),
    stop: () => stopMock(),
  }));
  const videoTracks = videoStops.map((stopMock) => ({
    addEventListener: vi.fn(),
    stop: () => stopMock(),
  }));
  return {
    getAudioTracks: () => audioTracks,
    getTracks: () => [...audioTracks, ...videoTracks],
    getVideoTracks: () => videoTracks,
  };
}

function stubMediaDevices({
  display,
  microphone,
}: {
  display: Promise<FakeMediaStream>;
  microphone: Promise<FakeMediaStream>;
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
    const microphone = Promise.withResolvers<FakeMediaStream>();
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
      pause: () => void;
      resume: () => void;
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
          pause: () => this.pause(),
          resume: () => this.resume(),
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

      pause() {
        this.state = "paused";
      }

      resume() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
      }
    }
    const createAudioTrack = (): FakeMediaTrack => ({
      addEventListener: vi.fn(),
      stop: vi.fn(),
    });
    const microphoneTrack = createAudioTrack();
    const processedMicrophoneTrack = createAudioTrack();
    processedMicrophoneTrack.applyConstraints = vi.fn(() => Promise.resolve());
    microphoneTrack.clone = () => processedMicrophoneTrack;
    const systemTrack = createAudioTrack();
    stubMediaDevices({
      display: Promise.resolve({
        getAudioTracks: () => [systemTrack],
        getTracks: () => [systemTrack],
        getVideoTracks: () => [],
      }),
      microphone: Promise.resolve({
        getAudioTracks: () => [microphoneTrack],
        getTracks: () => [microphoneTrack],
        getVideoTracks: () => [],
      }),
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
      flushCorrections: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      resume: vi.fn(),
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    recorders[0]?.emit({ data: new Blob(["mic"]) } as BlobEvent);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    recorders[1]?.emit({ data: new Blob(["system"]) } as BlobEvent);
    await vi.waitFor(() => expect(committed).toEqual({ microphone: 15_000, system: 15_000 }));

    await prepared.pause();
    expect(recorders.map((recorder) => recorder.state)).toEqual(["paused", "paused"]);
    expect(sidecar.flushCorrections).toHaveBeenCalledOnce();
    expect(sidecar.pause).toHaveBeenCalledOnce();

    await prepared.resume();
    expect(recorders.map((recorder) => recorder.state)).toEqual(["recording", "recording"]);
    expect(sidecar.resume).toHaveBeenCalledOnce();

    expect(failure).not.toHaveBeenCalled();
    expect(processedMicrophoneTrack.applyConstraints).toHaveBeenCalledWith({
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect(sidecar.start).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: { microphone: processedMicrophoneTrack, system: systemTrack },
      }),
    );
    expect(sidecar.start).toHaveBeenCalledOnce();
  });
});
