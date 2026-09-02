// oxlint-disable class-methods-use-this, promise/avoid-new, promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- MediaRecorder and MediaStreamTrack are event APIs; their stop/fragment events are explicitly bridged to promises and an ordered write chain.
import { CAPTURE_FRAGMENT_DURATION_MS } from "../../../../preload/meeting-capture";
import type {
  MeetingLiveTranscriptDraft,
  MeetingLiveTranscriptHints,
} from "@app/shared/meeting-transcription";
import type {
  CaptureSink,
  CaptureTrack,
  MeetingCaptureSource,
  PreparedCapture,
} from "../../../../preload/meeting-capture";
import { createDurableLiveTranscriptDraft } from "./live-transcript-draft";
import type { LiveTranscriptDraftSnapshot } from "./live-transcript-draft";
import { clearCapturePreviewStreams, setCapturePreviewStreams } from "./capture-preview-streams";

const MAX_PENDING_BYTES = 32 * 1024 * 1024;
const LEVEL_SAMPLE_MS = 200;
const MIME_TYPE_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function chooseMimeType(): string {
  return MIME_TYPE_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function captureErrorMessage(error: Error): string {
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

export interface MeetingLiveTranscriptSidecar {
  flushCorrections?: () => Promise<void>;
  getSnapshot?: () => LiveTranscriptDraftSnapshot;
  start: (input: {
    captureId: string;
    initialDraft?: MeetingLiveTranscriptDraft | null;
    liveTranscriptHints?: MeetingLiveTranscriptHints;
    tracks: Record<CaptureTrack, MediaStreamTrack>;
  }) => Promise<void>;
  pause?: () => void;
  resume?: () => Promise<void> | void;
  stop: () => void;
}

/**
 * 同时采集麦克风与系统音频，立即丢弃 display video，并把两个 MediaRecorder 流分片写入持久层。
 * Captures microphone and system audio, discards display video immediately, and streams both MediaRecorders into durable fragments.
 */
export class BrowserDualTrackCaptureSource implements MeetingCaptureSource {
  private readonly liveTranscriptSidecar: MeetingLiveTranscriptSidecar | undefined;

  constructor(liveTranscriptSidecar?: MeetingLiveTranscriptSidecar) {
    this.liveTranscriptSidecar = liveTranscriptSidecar;
  }

  async acquire(options: { microphoneDeviceId?: string } = {}): Promise<PreparedCapture> {
    let microphoneStream: MediaStream | null = null;
    let displayStream: MediaStream | null = null;
    let acquisitionFailed = false;
    let videoTracksDiscarded = 0;
    try {
      const microphoneRequest = navigator.mediaDevices
        .getUserMedia({
          audio: {
            autoGainControl: false,
            deviceId: options.microphoneDeviceId
              ? { exact: options.microphoneDeviceId }
              : undefined,
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
          // macOS 系统音频需要通过 display capture 获取，但产品只录音，因此视频轨一取得就停止。
          // macOS system audio arrives through display capture, but this audio-only product stops video immediately.
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

      let transcriptMicrophoneTrack = microphoneTrack;
      let processedTrack: MediaStreamTrack | null = null;
      if (this.liveTranscriptSidecar) {
        try {
          processedTrack = microphoneTrack.clone();
          await processedTrack.applyConstraints({
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          });
          transcriptMicrophoneTrack = processedTrack;
        } catch {
          processedTrack?.stop();
          // Live ASR processing is best effort. The authoritative raw recording must still start.
        }
      }

      const mimeType = chooseMimeType();
      const recorders: RecorderState[] = [];
      const monitors: (() => Promise<void>)[] = [];
      let disposed = false;
      let captureError: Error | null = null;
      let pendingBytes = 0;
      let sidecarStopped = false;

      const stopSidecar = () => {
        if (sidecarStopped) {
          return;
        }
        sidecarStopped = true;
        this.liveTranscriptSidecar?.stop();
      };

      const dispose = async () => {
        if (disposed) {
          return;
        }
        disposed = true;
        clearCapturePreviewStreams();
        stopSidecar();
        const stopped = recorders.map(({ recorder }) => waitForStop(recorder));
        for (const recorder of recorders) {
          if (recorder.recorder.state !== "inactive") {
            recorder.recorder.stop();
          }
        }
        await Promise.all(stopped);
        await Promise.all(recorders.map(({ writeChain }) => writeChain));
        await Promise.allSettled(monitors.map((stop) => stop()));
        if (microphoneStream) {
          stopStream(microphoneStream);
        }
        if (displayStream) {
          stopStream(displayStream);
        }
        if (transcriptMicrophoneTrack !== microphoneTrack) {
          transcriptMicrophoneTrack.stop();
        }
      };

      return {
        dispose,
        flushLiveTranscriptDraft: () =>
          this.liveTranscriptSidecar?.flushCorrections?.() ?? Promise.resolve(),
        getLiveTranscriptDraft: () => {
          const snapshot = this.liveTranscriptSidecar?.getSnapshot?.();
          return snapshot ? createDurableLiveTranscriptDraft(snapshot) : null;
        },
        pause: async () => {
          for (const { recorder } of recorders) {
            if (recorder.state === "recording") {
              recorder.pause();
            }
          }
          await this.liveTranscriptSidecar?.flushCorrections?.();
          this.liveTranscriptSidecar?.pause?.();
        },
        resume: async () => {
          for (const { recorder } of recorders) {
            if (recorder.state === "paused") {
              recorder.resume();
            }
          }
          await this.liveTranscriptSidecar?.resume?.();
        },
        start: (
          sink: CaptureSink,
          input: {
            captureId: string;
            initialLiveTranscriptDraft?: MeetingLiveTranscriptDraft | null;
            liveTranscriptHints?: MeetingLiveTranscriptHints;
          },
        ) => {
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
                console.info("[meeting-capture-renderer] dataavailable skipped", {
                  disposed,
                  sequence: state.sequence,
                  sizeBytes: event.data.size,
                  track,
                });
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
              // 每条音轨独立串行化 Blob 转换与落盘，保持 MediaRecorder 的原始字节顺序。
              // Each track serializes Blob conversion and persistence to preserve MediaRecorder byte order.
              state.writeChain = state.writeChain
                .then(async () => {
                  const bytes = new Uint8Array(await event.data.arrayBuffer());
                  console.info("[meeting-capture-renderer] dataavailable", {
                    sequence,
                    sizeBytes: bytes.byteLength,
                    track,
                  });
                  await sink.fragment({
                    bytes,
                    durationMs: Math.max(0, Math.round(endedAtMonotonicMs - startedAtMonotonicMs)),
                    endedAtMonotonicMs: Math.round(endedAtMonotonicMs),
                    sequence,
                    startedAtMonotonicMs: Math.max(0, Math.round(startedAtMonotonicMs)),
                    track,
                  });
                })
                .catch((error) => {
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
          setCapturePreviewStreams({
            microphone: new MediaStream([microphoneTrack]),
            system: new MediaStream([systemTrack]),
          });
          startMonitor("microphone", microphoneTrack);
          startMonitor("system", systemTrack);
          startRecorder("microphone", microphoneTrack);
          startRecorder("system", systemTrack);
          void this.liveTranscriptSidecar
            ?.start({
              captureId: input.captureId,
              initialDraft: input.initialLiveTranscriptDraft,
              liveTranscriptHints: input.liveTranscriptHints,
              tracks: { microphone: transcriptMicrophoneTrack, system: systemTrack },
            })
            .catch(() => {
              // Live Transcript Draft is explicitly non-authoritative and must not fail recording.
            });
          return Promise.resolve();
        },
        stop: async () => {
          clearCapturePreviewStreams();
          stopSidecar();
          const stopped = recorders.map(({ recorder }) => waitForStop(recorder));
          for (const { recorder } of recorders) {
            if (recorder.state !== "inactive") {
              recorder.stop();
            }
          }
          if (transcriptMicrophoneTrack !== microphoneTrack) {
            transcriptMicrophoneTrack.stop();
          }
          await Promise.all(stopped);
          await Promise.all(recorders.map(({ writeChain }) => writeChain));
          const readCaptureError = (): Error | null => captureError;
          const failure = readCaptureError();
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
      const acquisitionError = error instanceof Error ? error : new Error("无法取得会议音频");
      throw new Error(captureErrorMessage(acquisitionError), { cause: error });
    }
  }
}
