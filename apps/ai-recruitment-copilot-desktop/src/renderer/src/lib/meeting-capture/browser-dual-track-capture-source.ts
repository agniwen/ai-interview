// oxlint-disable class-methods-use-this, promise/avoid-new, promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- MediaRecorder and MediaStreamTrack are event APIs; their stop/fragment events are explicitly bridged to promises and an ordered write chain.
import { CAPTURE_FRAGMENT_DURATION_MS } from "../../../../preload/meeting-capture";
import type {
  CaptureSink,
  CaptureTrack,
  MeetingCaptureSource,
  PreparedCapture,
} from "../../../../preload/meeting-capture";

const MAX_PENDING_BYTES = 32 * 1024 * 1024;
const LEVEL_SAMPLE_MS = 200;
const MIME_TYPE_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function chooseMimeType(): string {
  return MIME_TYPE_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function captureErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "麦克风或系统音频权限被拒绝，请在 macOS 系统设置中允许 Meeting Buddy 后重试";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "未找到可用的麦克风或系统音频源";
  }
  return error instanceof Error ? error.message : "无法取得会议音频";
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function waitForStop(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === "inactive") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
  });
}

interface RecorderState {
  previousBoundaryMs: number;
  recorder: MediaRecorder;
  sequence: number;
  track: CaptureTrack;
  writeChain: Promise<void>;
}

export class BrowserDualTrackCaptureSource implements MeetingCaptureSource {
  async acquire(): Promise<PreparedCapture> {
    let microphoneStream: MediaStream | null = null;
    let displayStream: MediaStream | null = null;
    let acquisitionFailed = false;
    let videoTracksDiscarded = 0;
    try {
      const microphoneRequest = navigator.mediaDevices
        .getUserMedia({
          audio: {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
          },
          video: false,
        })
        .then((stream) => {
          microphoneStream = stream;
          if (acquisitionFailed) {
            stopStream(stream);
          }
          return stream;
        });
      const displayRequest = navigator.mediaDevices
        .getDisplayMedia({ audio: true, video: true })
        .then((stream) => {
          displayStream = stream;
          const videoTracks = stream.getVideoTracks();
          videoTracksDiscarded = videoTracks.length;
          for (const videoTrack of videoTracks) {
            videoTrack.stop();
          }
          if (acquisitionFailed) {
            stopStream(stream);
          }
          return stream;
        });
      [microphoneStream, displayStream] = await Promise.all([microphoneRequest, displayRequest]);
      const [microphoneTrack] = microphoneStream.getAudioTracks();
      const [systemTrack] = displayStream.getAudioTracks();
      if (!microphoneTrack) {
        throw new Error("麦克风没有返回可录制音轨");
      }
      if (!systemTrack) {
        throw new Error("系统音频没有返回可录制音轨，请检查屏幕与系统音频权限和输出路由");
      }

      const mimeType = chooseMimeType();
      const recorders: RecorderState[] = [];
      const monitors: (() => Promise<void>)[] = [];
      let disposed = false;
      let captureError: Error | null = null;
      let pendingBytes = 0;

      const dispose = async () => {
        if (disposed) {
          return;
        }
        disposed = true;
        const stopped = recorders.map(({ recorder }) => waitForStop(recorder));
        for (const recorder of recorders) {
          if (recorder.recorder.state !== "inactive") {
            recorder.recorder.stop();
          }
        }
        await Promise.all(stopped);
        await Promise.all(recorders.map(({ writeChain }) => writeChain));
        await Promise.allSettled(monitors.map((stop) => stop()));
        stopStream(microphoneStream as MediaStream);
        stopStream(displayStream as MediaStream);
      };

      return {
        dispose,
        start: (sink: CaptureSink) => {
          const startedAt = performance.now();
          const fail = (error: Error) => {
            if (captureError || disposed) {
              return;
            }
            captureError = error;
            sink.failure(error);
            for (const recorder of recorders) {
              if (recorder.recorder.state === "recording") {
                recorder.recorder.stop();
              }
            }
          };

          const addTrackObservers = (track: CaptureTrack, mediaTrack: MediaStreamTrack) => {
            mediaTrack.addEventListener("ended", () => sink.status({ health: "ended", track }));
            mediaTrack.addEventListener("mute", () => sink.status({ health: "muted", track }));
          };

          const startMonitor = (track: CaptureTrack, mediaTrack: MediaStreamTrack) => {
            const context = new AudioContext();
            const sourceNode = context.createMediaStreamSource(new MediaStream([mediaTrack]));
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            sourceNode.connect(analyser);
            const samples = new Float32Array(analyser.fftSize);
            const interval = setInterval(() => {
              analyser.getFloatTimeDomainData(samples);
              let sum = 0;
              for (const value of samples) {
                sum += value * value;
              }
              sink.level({ level: Math.sqrt(sum / samples.length), track });
            }, LEVEL_SAMPLE_MS);
            monitors.push(async () => {
              clearInterval(interval);
              sourceNode.disconnect();
              await context.close();
            });
          };

          const startRecorder = (track: CaptureTrack, mediaTrack: MediaStreamTrack) => {
            const recorder = new MediaRecorder(
              new MediaStream([mediaTrack]),
              mimeType ? { mimeType } : undefined,
            );
            const state: RecorderState = {
              previousBoundaryMs: startedAt,
              recorder,
              sequence: 0,
              track,
              writeChain: Promise.resolve(),
            };
            recorder.addEventListener("dataavailable", (event) => {
              if (disposed || event.data.size === 0) {
                return;
              }
              const boundaryMs = performance.now();
              const { sequence } = state;
              state.sequence += 1;
              const startedAtMonotonicMs = state.previousBoundaryMs - startedAt;
              const endedAtMonotonicMs = boundaryMs - startedAt;
              state.previousBoundaryMs = boundaryMs;
              pendingBytes += event.data.size;
              if (pendingBytes > MAX_PENDING_BYTES) {
                fail(new Error("本地磁盘写入跟不上录音速度，录制已停止以避免静默丢失音频"));
                return;
              }
              state.writeChain = state.writeChain
                .then(async () => {
                  const bytes = new Uint8Array(await event.data.arrayBuffer());
                  await sink.fragment({
                    bytes,
                    durationMs: Math.max(0, Math.round(endedAtMonotonicMs - startedAtMonotonicMs)),
                    endedAtMonotonicMs: Math.round(endedAtMonotonicMs),
                    sequence,
                    startedAtMonotonicMs: Math.max(0, Math.round(startedAtMonotonicMs)),
                    track,
                  });
                })
                .catch((error: unknown) => {
                  fail(error instanceof Error ? error : new Error("本地录音分片写入失败"));
                })
                .finally(() => {
                  pendingBytes -= event.data.size;
                });
            });
            recorder.addEventListener("error", () => fail(new Error(`${track} 录音器发生错误`)));
            recorders.push(state);
            recorder.start(CAPTURE_FRAGMENT_DURATION_MS);
          };

          addTrackObservers("microphone", microphoneTrack);
          addTrackObservers("system", systemTrack);
          startMonitor("microphone", microphoneTrack);
          startMonitor("system", systemTrack);
          startRecorder("microphone", microphoneTrack);
          startRecorder("system", systemTrack);
          return Promise.resolve();
        },
        stop: async () => {
          const stopped = recorders.map(({ recorder }) => waitForStop(recorder));
          for (const { recorder } of recorders) {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          }
          await Promise.all(stopped);
          await Promise.all(recorders.map(({ writeChain }) => writeChain));
          const failure = captureError as Error | null;
          if (failure) {
            throw new Error(failure.message, { cause: failure });
          }
        },
        trackContentTypes: {
          microphone: mimeType || "application/octet-stream",
          system: mimeType || "application/octet-stream",
        },
        videoTracksDiscarded,
      };
    } catch (error) {
      acquisitionFailed = true;
      if (microphoneStream) {
        stopStream(microphoneStream);
      }
      if (displayStream) {
        stopStream(displayStream);
      }
      throw new Error(captureErrorMessage(error), { cause: error });
    }
  }
}
