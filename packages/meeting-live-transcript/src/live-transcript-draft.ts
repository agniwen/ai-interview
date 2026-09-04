// oxlint-disable max-lines, promise/avoid-new, promise/prefer-await-to-callbacks -- This cohesive state machine exceeds the generic line limit; provider completion and reconnect scheduling are callback-based by design.
import type { LiveCorrectionBatch, LiveCorrectionEvent } from "@app/shared/meeting-live-correction";
import type {
  MeetingLiveTranscriptDraft,
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptHints,
  MeetingLiveTranscriptTrack,
  MeetingLiveTranscriptWord,
} from "@app/shared/meeting-transcription";
import {
  appendLiveTranscriptTurn,
  createLiveTranscriptCorrectionBatches,
} from "./live-transcript-draft-turns";
export { createDurableLiveTranscriptDraft } from "./live-transcript-draft-turns";
export {
  appendLiveTranscriptTurn,
  createLiveTranscriptCorrectionBatches,
} from "./live-transcript-draft-turns";

export type LiveTranscriptDraftStatus =
  | "idle"
  | "starting"
  | "live"
  | "buffering"
  | "degraded"
  | "interrupted"
  | "reconnecting";

export type LiveTranscriptDraftSection = MeetingLiveTranscriptDraft["sections"][number];

export type LiveTranscriptDraftTurn = MeetingLiveTranscriptDraft["turns"][number] & {
  correcting?: boolean;
};

export interface LiveTranscriptDraftSnapshot {
  captureId: string | null;
  droppedAudioMs: number;
  droppedPcmFrames: number;
  error: string | null;
  queuedAudioMs: number;
  queuedPcmBytes: number;
  queuePeakAudioMs: number;
  sections: LiveTranscriptDraftSection[];
  status: LiveTranscriptDraftStatus;
  trackDroppedAudioMs: Record<MeetingLiveTranscriptTrack, number>;
  trackQueuePeakAudioMs: Record<MeetingLiveTranscriptTrack, number>;
  trackQueuedAudioMs: Record<MeetingLiveTranscriptTrack, number>;
  trackStatus: Record<MeetingLiveTranscriptTrack, LiveTranscriptDraftStatus>;
  turns: LiveTranscriptDraftTurn[];
}

export interface LiveTranscriptConnection {
  close: () => void;
  correct?: (batch: LiveCorrectionBatch) => boolean;
  sendPcm: (frame: Int16Array) => boolean;
}

export interface LiveTranscriptEvent {
  correctionModel?: string;
  endMs?: number;
  itemId: string;
  originalText?: string;
  speakerDisplayName?: string | null;
  speakerKey?: string;
  startMs?: number;
  text: string;
  type:
    | "completed"
    | "corrected"
    | "correction-started"
    | "correction-finished"
    | "delta"
    | "snapshot";
  words?: MeetingLiveTranscriptWord[];
}

export interface LiveTranscriptPcmTap {
  stop: () => void;
}

export interface LiveTranscriptDraftDependencies<
  Authorization = MeetingLiveTranscriptAuthorization,
> {
  authorizationFailureReason?: (error: Error) => "authorization" | "capacity";
  authorizationFailureMessage?: (error: Error) => string | null;
  authorize: (input: {
    captureId: string;
    hints?: MeetingLiveTranscriptHints;
    track: MeetingLiveTranscriptTrack;
  }) => Promise<Authorization>;
  connect: (input: {
    authorization: Authorization;
    captureId: string;
    sectionId: string;
    onCorrection: (event: LiveCorrectionEvent) => void;
    onDisconnect: (reason: string) => void;
    onTranscript: (event: LiveTranscriptEvent) => void;
    onWritable: () => void;
  }) => Promise<LiveTranscriptConnection>;
  createPcmTap: (input: {
    mediaTrack: MediaStreamTrack;
    onFrame: (frame: Int16Array) => void;
    track: MeetingLiveTranscriptTrack;
  }) => Promise<LiveTranscriptPcmTap>;
  heartbeat?: (captureId: string) => Promise<boolean>;
  maxDraftTurns?: number;
  maxQueuedAudioMsPerTrack?: number;
  maxQueuedPcmBytesPerTrack?: number;
  maxReconnectAttempts?: number;
  maxReconnectDelayMs?: number;
  correctionLookaheadMs?: number;
  random?: () => number;
  release?: (captureId: string) => Promise<void>;
  reconnectDelayMs?: number;
  scheduleReconnect?: (callback: () => void, delayMs: number) => () => void;
  scheduleLeaseHeartbeat?: (callback: () => void, delayMs: number) => () => void;
  scheduleCorrectionLookahead?: (callback: () => void, delayMs: number) => () => void;
  shouldReconnect?: (error: Error) => boolean;
}

interface TrackRuntime {
  cancelReconnect: (() => void) | null;
  connection: LiveTranscriptConnection | null;
  generation: number;
  mediaTrack: MediaStreamTrack | null;
  pcmTap: LiveTranscriptPcmTap | null;
  queue: BoundedPcmQueue;
  reconnectAttempts: number;
  sectionId: string | null;
  status: LiveTranscriptDraftStatus;
}

interface DroppedPcmSummary {
  audioMs: number;
  frames: number;
}

const DEFAULT_MAX_QUEUED_PCM_BYTES = 512 * 1024;
const DEFAULT_MAX_QUEUED_AUDIO_MS = 5000;
const BUFFERING_NOTICE_MS = 2000;
const DEFAULT_MAX_DRAFT_TURNS = 500;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_RECONNECT_DELAY_MS = 1500;
const DEFAULT_CORRECTION_LOOKAHEAD_MS = 4000;
const DEFAULT_CORRECTION_FLUSH_TIMEOUT_MS = 5000;
const LEASE_HEARTBEAT_MS = 30_000;
const MAX_DRAFT_SECTIONS = 200;
const PCM_SAMPLE_RATE = 24_000;
const TRACKS: MeetingLiveTranscriptTrack[] = ["microphone", "system"];

/**
 * WebRTC 背压期间的有界 PCM 队列；宁可丢弃 Draft 帧，也不能让非权威字幕拖垮本地录音。
 * Bounded PCM queue for WebRTC backpressure; draft frames may drop rather than endanger authoritative local recording.
 */
class BoundedPcmQueue {
  private readonly frames: { audioMs: number; frame: Int16Array }[] = [];
  private readonly maxAudioMs: number;
  private readonly maxBytes: number;
  private durationMs = 0;
  private sizeBytes = 0;

  constructor(maxBytes: number, maxAudioMs: number) {
    this.maxBytes = maxBytes;
    this.maxAudioMs = maxAudioMs;
  }

  get audioMs(): number {
    return this.durationMs;
  }

  get bytes(): number {
    return this.sizeBytes;
  }

  clear(): void {
    this.frames.length = 0;
    this.durationMs = 0;
    this.sizeBytes = 0;
  }

  enqueueLatest(frame: Int16Array): DroppedPcmSummary {
    const audioMs = (frame.length / PCM_SAMPLE_RATE) * 1000;
    if (frame.byteLength > this.maxBytes || audioMs > this.maxAudioMs) {
      return { audioMs, frames: 1 };
    }
    let droppedAudioMs = 0;
    let droppedFrames = 0;
    while (
      this.frames.length > 0 &&
      (this.sizeBytes + frame.byteLength > this.maxBytes ||
        this.durationMs + audioMs > this.maxAudioMs)
    ) {
      droppedAudioMs += this.shift();
      droppedFrames += 1;
    }
    this.frames.push({ audioMs, frame });
    this.durationMs += audioMs;
    this.sizeBytes += frame.byteLength;
    return { audioMs: droppedAudioMs, frames: droppedFrames };
  }

  peek(): Int16Array | undefined {
    return this.frames[0]?.frame;
  }

  shift(): number {
    const item = this.frames.shift();
    if (item) {
      this.durationMs -= item.audioMs;
      this.sizeBytes -= item.frame.byteLength;
      return item.audioMs;
    }
    return 0;
  }
}

const initialSnapshot = (): LiveTranscriptDraftSnapshot => ({
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
});

function publicError(reason: string): string {
  if (reason === "provider-busy") {
    return "实时字幕服务暂时繁忙，正在自动重试，录音仍在继续";
  }
  if (reason === "degraded") {
    return "实时字幕可能有遗漏，录音仍在继续";
  }
  if (reason === "authorization") {
    return "实时字幕授权暂不可用，录音仍在继续";
  }
  if (reason === "capacity") {
    return "实时字幕容量已满，录制仍在本地继续";
  }
  return "实时字幕已中断，录音仍在继续";
}

/**
 * 管理双轨实时字幕草稿、独立重连和服务端容量租约。Draft 永远不是最终权威转录。
 * Manages dual-track live drafts, independent reconnects, and the server capacity lease; drafts are never authoritative.
 */
export function createLiveTranscriptDraft<Authorization = MeetingLiveTranscriptAuthorization>(
  dependencies: LiveTranscriptDraftDependencies<Authorization>,
) {
  const maxQueuedPcmBytes = dependencies.maxQueuedPcmBytesPerTrack ?? DEFAULT_MAX_QUEUED_PCM_BYTES;
  const maxQueuedAudioMs = dependencies.maxQueuedAudioMsPerTrack ?? DEFAULT_MAX_QUEUED_AUDIO_MS;
  const createTrackRuntime = (): TrackRuntime => ({
    cancelReconnect: null,
    connection: null,
    generation: 0,
    mediaTrack: null,
    pcmTap: null,
    queue: new BoundedPcmQueue(maxQueuedPcmBytes, maxQueuedAudioMs),
    reconnectAttempts: 0,
    sectionId: null,
    status: "idle",
  });
  const runtimes = {
    microphone: createTrackRuntime(),
    system: createTrackRuntime(),
  } satisfies Record<MeetingLiveTranscriptTrack, TrackRuntime>;
  const listeners = new Set<(snapshot: LiveTranscriptDraftSnapshot) => void>();
  const scheduleReconnect =
    dependencies.scheduleReconnect ??
    ((callback: () => void, delayMs: number) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    });
  const correctionBatches = createLiveTranscriptCorrectionBatches();
  let snapshot = initialSnapshot();
  let sectionSequence = 0;
  let cancelLeaseHeartbeat: (() => void) | null = null;
  let cancelCorrectionLookahead: (() => void) | null = null;
  let leaseHeartbeatFailures = 0;
  let liveTranscriptHints: MeetingLiveTranscriptHints | undefined;
  let releasedLeaseCaptureId: string | null = null;
  let paused = false;
  const correctionIdleWaiters = new Set<() => void>();

  const notifyCorrectionIdle = (): void => {
    if (!correctionBatches.isIdle()) {
      return;
    }
    for (const resolve of correctionIdleWaiters) {
      resolve();
    }
    correctionIdleWaiters.clear();
  };

  const closeConnection = (runtime: TrackRuntime): void => {
    runtime.connection?.close();
    runtime.connection = null;
    snapshot = {
      ...snapshot,
      turns: correctionBatches
        .cancelSection(snapshot.turns, runtime.sectionId)
        .map((turn) =>
          turn.sectionId === runtime.sectionId && turn.correcting
            ? { ...turn, correcting: false }
            : turn,
        ),
    };
    notifyCorrectionIdle();
  };

  const releaseLeaseBestEffort = async (captureId: string): Promise<void> => {
    try {
      await dependencies.release?.(captureId);
    } catch {
      // The short lease expires server-side if release cannot be delivered.
    }
  };

  const releaseLeaseOnce = (captureId: string): void => {
    if (releasedLeaseCaptureId === captureId) {
      return;
    }
    releasedLeaseCaptureId = captureId;
    void releaseLeaseBestEffort(captureId);
  };

  const aggregateStatus = (): LiveTranscriptDraftStatus => {
    const statuses = TRACKS.map((track) => runtimes[track].status);
    if (statuses.includes("reconnecting")) {
      return "reconnecting";
    }
    if (statuses.includes("interrupted")) {
      return "interrupted";
    }
    if (statuses.includes("degraded")) {
      return "degraded";
    }
    if (statuses.includes("buffering")) {
      return "buffering";
    }
    if (statuses.every((status) => status === "live")) {
      return "live";
    }
    if (statuses.some((status) => ["starting", "live", "buffering", "degraded"].includes(status))) {
      return "starting";
    }
    return "idle";
  };

  const publish = (next: Partial<LiveTranscriptDraftSnapshot> = {}) => {
    const trackQueuedAudioMs = {
      microphone: runtimes.microphone.queue.audioMs,
      system: runtimes.system.queue.audioMs,
    };
    const queuedAudioMs = Math.max(...Object.values(trackQueuedAudioMs));
    snapshot = {
      ...snapshot,
      ...next,
      queuePeakAudioMs: Math.max(snapshot.queuePeakAudioMs, queuedAudioMs),
      queuedAudioMs,
      queuedPcmBytes: TRACKS.reduce((total, track) => total + runtimes[track].queue.bytes, 0),
      status: aggregateStatus(),
      trackQueuePeakAudioMs: {
        microphone: Math.max(
          snapshot.trackQueuePeakAudioMs.microphone,
          trackQueuedAudioMs.microphone,
        ),
        system: Math.max(snapshot.trackQueuePeakAudioMs.system, trackQueuedAudioMs.system),
      },
      trackQueuedAudioMs,
      trackStatus: {
        microphone: runtimes.microphone.status,
        system: runtimes.system.status,
      },
    };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const updateFlowControlStatus = (runtime: TrackRuntime, droppedFrames = 0) => {
    if (droppedFrames > 0) {
      runtime.status = "degraded";
      return;
    }
    runtime.status = runtime.queue.audioMs >= BUFFERING_NOTICE_MS ? "buffering" : "live";
  };

  function requestCorrections(force = false): void {
    correctionBatches.request(
      snapshot.turns,
      runtimes,
      (ids, correcting) => {
        publish({
          turns: snapshot.turns.map((turn) =>
            ids.includes(turn.id) ? { ...turn, correcting } : turn,
          ),
        });
      },
      { force },
    );
  }

  const scheduleTrailingCorrections = () => {
    cancelCorrectionLookahead?.();
    const schedule =
      dependencies.scheduleCorrectionLookahead ??
      ((callback: () => void, delayMs: number) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      });
    cancelCorrectionLookahead = schedule(() => {
      cancelCorrectionLookahead = null;
      requestCorrections(true);
    }, dependencies.correctionLookaheadMs ?? DEFAULT_CORRECTION_LOOKAHEAD_MS);
  };

  const flushCorrections = async (): Promise<void> => {
    cancelCorrectionLookahead?.();
    cancelCorrectionLookahead = null;
    requestCorrections(true);
    if (correctionBatches.isIdle()) {
      return;
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        correctionIdleWaiters.delete(finish);
        resolve();
      };
      setTimeout(finish, DEFAULT_CORRECTION_FLUSH_TIMEOUT_MS);
      correctionIdleWaiters.add(finish);
    });
  };

  const stop = (): void => {
    const releasedCaptureId = snapshot.captureId;
    cancelLeaseHeartbeat?.();
    cancelLeaseHeartbeat = null;
    cancelCorrectionLookahead?.();
    cancelCorrectionLookahead = null;
    leaseHeartbeatFailures = 0;
    liveTranscriptHints = undefined;
    paused = false;
    for (const track of TRACKS) {
      const runtime = runtimes[track];
      runtime.generation += 1;
      runtime.cancelReconnect?.();
      runtime.cancelReconnect = null;
      closeConnection(runtime);
      runtime.pcmTap?.stop();
      runtime.pcmTap = null;
      runtime.mediaTrack = null;
      runtime.queue.clear();
      runtime.reconnectAttempts = 0;
      runtime.sectionId = null;
      runtime.status = "idle";
    }
    sectionSequence = 0;
    correctionBatches.clear();
    notifyCorrectionIdle();
    snapshot = initialSnapshot();
    publish();
    if (releasedCaptureId) {
      releaseLeaseOnce(releasedCaptureId);
    }
  };

  const releaseLeaseWhenAllTracksTerminal = (captureId: string): void => {
    // 仅当两轨都没有连接、启动或待重连工作时释放共享 Capture 租约。
    // Release the shared capture lease only after neither track can still become live or reconnect.
    if (
      snapshot.captureId !== captureId ||
      TRACKS.some((track) => {
        const runtime = runtimes[track];
        return (
          runtime.connection ||
          runtime.cancelReconnect ||
          ["live", "reconnecting", "starting"].includes(runtime.status)
        );
      })
    ) {
      return;
    }
    cancelLeaseHeartbeat?.();
    cancelLeaseHeartbeat = null;
    leaseHeartbeatFailures = 0;
    for (const track of TRACKS) {
      runtimes[track].pcmTap?.stop();
      runtimes[track].pcmTap = null;
    }
    releaseLeaseOnce(captureId);
  };

  function scheduleLeaseHeartbeat(captureId: string, delayMs = LEASE_HEARTBEAT_MS): void {
    const { heartbeat } = dependencies;
    if (!heartbeat) {
      return;
    }
    const schedule =
      dependencies.scheduleLeaseHeartbeat ??
      ((callback: () => void, delay: number) => {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      });
    cancelLeaseHeartbeat?.();
    cancelLeaseHeartbeat = schedule(() => {
      const handleFailure = () => {
        if (snapshot.captureId !== captureId) {
          return;
        }
        leaseHeartbeatFailures += 1;
        if (leaseHeartbeatFailures < 3) {
          scheduleLeaseHeartbeat(captureId, 5000);
          return;
        }
        for (const track of TRACKS) {
          const runtime = runtimes[track];
          runtime.generation += 1;
          runtime.cancelReconnect?.();
          runtime.cancelReconnect = null;
          closeConnection(runtime);
          runtime.pcmTap?.stop();
          runtime.pcmTap = null;
          runtime.status = "interrupted";
        }
        cancelLeaseHeartbeat = null;
        publish({ error: publicError("authorization") });
      };
      const runHeartbeat = async (): Promise<void> => {
        try {
          const renewed = await heartbeat(captureId);
          if (snapshot.captureId !== captureId) {
            return;
          }
          if (renewed) {
            leaseHeartbeatFailures = 0;
            scheduleLeaseHeartbeat(captureId);
            return;
          }
          handleFailure();
        } catch {
          handleFailure();
        }
      };
      void runHeartbeat();
    }, delayMs);
  }

  const appendTranscript = (
    track: MeetingLiveTranscriptTrack,
    sectionId: string,
    event: LiveTranscriptEvent,
  ) => {
    const turns = appendLiveTranscriptTurn(snapshot.turns, track, sectionId, event);
    if (!turns) {
      return;
    }
    const maxTurns = dependencies.maxDraftTurns ?? DEFAULT_MAX_DRAFT_TURNS;
    publish({ turns: turns.slice(-maxTurns) });
    if (event.type === "completed") {
      requestCorrections();
      scheduleTrailingCorrections();
    } else if (event.type === "snapshot" || event.type === "delta") {
      requestCorrections();
      scheduleTrailingCorrections();
    }
  };

  const flush = (track: MeetingLiveTranscriptTrack): boolean => {
    const runtime = runtimes[track];
    while (runtime.connection) {
      const frame = runtime.queue.peek();
      if (!frame) {
        break;
      }
      if (!runtime.connection.sendPcm(frame)) {
        return false;
      }
      runtime.queue.shift();
    }
    return true;
  };

  const scheduleTrackReconnect = (
    runtime: TrackRuntime,
    callback: () => void,
    reason: string,
  ): (() => void) | null => {
    const providerBusy = reason === "provider-busy";
    const maxAttempts = dependencies.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    if (!providerBusy && runtime.reconnectAttempts >= maxAttempts) {
      return null;
    }
    // Provider saturation is temporary. Keep a slow retry alive until capture stops,
    // instead of exhausting the network retry budget while the service is busy.
    const baseDelay = providerBusy
      ? 20_000
      : (dependencies.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);
    const maxDelay = providerBusy
      ? 50_000
      : (dependencies.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS);
    const exponentialDelay = Math.min(baseDelay * 2 ** runtime.reconnectAttempts, maxDelay);
    const jitter = 0.8 + (dependencies.random?.() ?? Math.random()) * 0.4;
    runtime.reconnectAttempts += 1;
    return scheduleReconnect(callback, Math.round(exponentialDelay * jitter));
  };

  const connectTrack = async (track: MeetingLiveTranscriptTrack, reconnecting: boolean) => {
    const runtime = runtimes[track];
    const { captureId } = snapshot;
    if (!(captureId && runtime.mediaTrack)) {
      return;
    }
    runtime.cancelReconnect = null;
    runtime.queue.clear();
    runtime.status = reconnecting ? "reconnecting" : "starting";
    // generation 令牌阻止迟到的授权、连接或 AudioWorklet 回调复活旧会话。
    // The generation token prevents late authorization, connection, or AudioWorklet work from reviving stale sessions.
    runtime.generation += 1;
    const { generation } = runtime;
    const sectionId = `${captureId}:${track}:${sectionSequence}`;
    const section: LiveTranscriptDraftSection = {
      id: sectionId,
      sequence: sectionSequence,
      startedAt: new Date().toISOString(),
      track,
    };
    sectionSequence += 1;
    runtime.sectionId = sectionId;
    publish({
      error: null,
      sections: [...snapshot.sections, section].slice(-MAX_DRAFT_SECTIONS),
    });

    const interrupt = (reason: string, reconnect = true, errorMessage?: string) => {
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        return;
      }
      runtime.generation += 1;
      closeConnection(runtime);
      runtime.queue.clear();
      runtime.status = "interrupted";
      publish({ error: errorMessage ?? publicError(reason) });
      if (reconnect && !runtime.cancelReconnect) {
        runtime.cancelReconnect = scheduleTrackReconnect(
          runtime,
          async () => {
            await connectTrack(track, true);
          },
          reason,
        );
        if (runtime.cancelReconnect && reason === "provider-busy") {
          runtime.status = "reconnecting";
          publish({ error: publicError(reason) });
        }
      }
      releaseLeaseWhenAllTracksTerminal(captureId);
    };

    try {
      const authorization = await dependencies.authorize({
        captureId,
        hints: liveTranscriptHints,
        track,
      });
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        if (snapshot.captureId !== captureId) {
          void releaseLeaseBestEffort(captureId);
        }
        return;
      }
      releasedLeaseCaptureId = null;
      scheduleLeaseHeartbeat(captureId);
      const connection = await dependencies.connect({
        authorization,
        captureId,
        onCorrection: (event) => {
          if (runtime.generation === generation && runtime.sectionId === sectionId) {
            publish({ turns: correctionBatches.apply(snapshot.turns, event) });
            notifyCorrectionIdle();
          }
        },
        onDisconnect: (reason) => interrupt(reason),
        onTranscript: (event) => {
          if (runtime.generation === generation && runtime.sectionId === sectionId) {
            if (event.text.trim()) {
              runtime.reconnectAttempts = 0;
            }
            appendTranscript(track, sectionId, event);
          }
        },
        onWritable: () => {
          if (runtime.generation !== generation || runtime.sectionId !== sectionId) {
            return;
          }
          if (flush(track)) {
            runtime.status = "live";
            publish({ error: null });
          } else {
            updateFlowControlStatus(runtime);
            publish({ error: null });
          }
        },
        sectionId,
      });
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        connection.close();
        return;
      }
      runtime.connection = connection;
      requestCorrections();
      if (flush(track)) {
        runtime.status = "live";
      } else {
        updateFlowControlStatus(runtime);
      }
      publish({ error: null });
    } catch (error) {
      const connectionError = error instanceof Error ? error : new Error("实时字幕连接失败");
      interrupt(
        dependencies.authorizationFailureReason?.(connectionError) ?? "authorization",
        dependencies.shouldReconnect?.(connectionError) ?? true,
        dependencies.authorizationFailureMessage?.(connectionError) ?? undefined,
      );
    }
  };

  const onFrame = (track: MeetingLiveTranscriptTrack, frame: Int16Array) => {
    const runtime = runtimes[track];
    if (runtime.connection && runtime.queue.bytes === 0 && runtime.connection.sendPcm(frame)) {
      return;
    }
    const dropped = runtime.queue.enqueueLatest(frame);
    if (dropped.frames > 0) {
      snapshot = {
        ...snapshot,
        droppedAudioMs: snapshot.droppedAudioMs + dropped.audioMs,
        droppedPcmFrames: snapshot.droppedPcmFrames + dropped.frames,
        trackDroppedAudioMs: {
          ...snapshot.trackDroppedAudioMs,
          [track]: snapshot.trackDroppedAudioMs[track] + dropped.audioMs,
        },
      };
    }
    if (runtime.connection) {
      updateFlowControlStatus(runtime, dropped.frames);
      publish({ error: dropped.frames > 0 ? publicError("degraded") : null });
      return;
    }
    publish({ error: dropped.frames > 0 ? publicError("degraded") : null });
  };

  const start = async (input: {
    captureId: string;
    initialDraft?: MeetingLiveTranscriptDraft | null;
    liveTranscriptHints?: MeetingLiveTranscriptHints;
    tracks: Record<MeetingLiveTranscriptTrack, MediaStreamTrack>;
  }): Promise<void> => {
    stop();
    paused = false;
    releasedLeaseCaptureId = null;
    const { liveTranscriptHints: hints } = input;
    liveTranscriptHints = hints;
    const initial = initialSnapshot();
    const seededSections = input.initialDraft?.sections ?? [];
    snapshot = {
      ...initial,
      captureId: input.captureId,
      droppedAudioMs: input.initialDraft?.droppedAudioMs ?? 0,
      droppedPcmFrames: input.initialDraft?.droppedPcmFrames ?? 0,
      error: input.initialDraft?.error ?? null,
      sections: seededSections,
      turns: input.initialDraft?.turns ?? [],
    };
    sectionSequence = 0;
    for (const section of seededSections) {
      sectionSequence = Math.max(sectionSequence, section.sequence + 1);
    }
    for (const track of TRACKS) {
      const runtime = runtimes[track];
      runtime.mediaTrack = input.tracks[track];
      runtime.status = "starting";
    }
    publish();
    await Promise.all(
      TRACKS.map(async (track) => {
        const runtime = runtimes[track];
        const { generation } = runtime;
        try {
          const pcmTap = await dependencies.createPcmTap({
            mediaTrack: input.tracks[track],
            onFrame: (frame) => onFrame(track, frame),
            track,
          });
          if (runtime.generation !== generation || snapshot.captureId !== input.captureId) {
            pcmTap.stop();
            return;
          }
          runtime.pcmTap = pcmTap;
          await connectTrack(track, false);
        } catch {
          if (runtime.generation !== generation || snapshot.captureId !== input.captureId) {
            return;
          }
          runtime.status = "interrupted";
          publish({ error: publicError("authorization") });
          releaseLeaseWhenAllTracksTerminal(input.captureId);
        }
      }),
    );
  };

  const pause = (): void => {
    const { captureId } = snapshot;
    if (!captureId || paused) {
      return;
    }
    paused = true;
    cancelLeaseHeartbeat?.();
    cancelLeaseHeartbeat = null;
    cancelCorrectionLookahead?.();
    cancelCorrectionLookahead = null;
    leaseHeartbeatFailures = 0;
    for (const track of TRACKS) {
      const runtime = runtimes[track];
      runtime.generation += 1;
      runtime.cancelReconnect?.();
      runtime.cancelReconnect = null;
      closeConnection(runtime);
      runtime.pcmTap?.stop();
      runtime.pcmTap = null;
      runtime.queue.clear();
      runtime.reconnectAttempts = 0;
      runtime.sectionId = null;
      runtime.status = "idle";
    }
    publish({ error: null });
    releaseLeaseOnce(captureId);
  };

  const resume = async (): Promise<void> => {
    const { captureId } = snapshot;
    if (!(captureId && paused)) {
      return;
    }
    paused = false;
    releasedLeaseCaptureId = null;
    for (const track of TRACKS) {
      runtimes[track].status = "starting";
    }
    publish({ error: null });
    await Promise.all(
      TRACKS.map(async (track) => {
        const runtime = runtimes[track];
        const { mediaTrack } = runtime;
        if (!mediaTrack) {
          runtime.status = "interrupted";
          publish({ error: publicError("interrupted") });
          return;
        }
        const { generation } = runtime;
        try {
          const pcmTap = await dependencies.createPcmTap({
            mediaTrack,
            onFrame: (frame) => onFrame(track, frame),
            track,
          });
          if (paused || runtime.generation !== generation || snapshot.captureId !== captureId) {
            pcmTap.stop();
            return;
          }
          runtime.pcmTap = pcmTap;
          await connectTrack(track, false);
        } catch {
          if (paused || runtime.generation !== generation || snapshot.captureId !== captureId) {
            return;
          }
          runtime.status = "interrupted";
          publish({ error: publicError("authorization") });
          releaseLeaseWhenAllTracksTerminal(captureId);
        }
      }),
    );
  };

  return {
    flushCorrections,
    getSnapshot: () => snapshot,
    observe: (listener: (next: LiveTranscriptDraftSnapshot) => void) => {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    pause,
    resume,
    start,
    stop,
  };
}

export type LiveTranscriptDraft = ReturnType<typeof createLiveTranscriptDraft>;
