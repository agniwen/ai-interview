// oxlint-disable promise/prefer-await-to-callbacks -- Reconnect scheduling is callback-based by design.
import type {
  MeetingLiveTranscriptAuthorization,
  MeetingLiveTranscriptTrack,
} from "@arc/shared/meeting-transcription";

export type LiveTranscriptDraftStatus =
  | "idle"
  | "starting"
  | "live"
  | "interrupted"
  | "reconnecting";

export interface LiveTranscriptDraftSection {
  id: string;
  sequence: number;
  startedAt: string;
  track: MeetingLiveTranscriptTrack;
}

export interface LiveTranscriptDraftTurn {
  final: boolean;
  id: string;
  sectionId: string;
  text: string;
  track: MeetingLiveTranscriptTrack;
}

export interface LiveTranscriptDraftSnapshot {
  captureId: string | null;
  droppedPcmFrames: number;
  error: string | null;
  queuedPcmBytes: number;
  sections: LiveTranscriptDraftSection[];
  status: LiveTranscriptDraftStatus;
  trackStatus: Record<MeetingLiveTranscriptTrack, LiveTranscriptDraftStatus>;
  turns: LiveTranscriptDraftTurn[];
}

export interface LiveTranscriptConnection {
  close: () => void;
  sendPcm: (frame: Int16Array) => boolean;
}

export interface LiveTranscriptPcmTap {
  stop: () => void;
}

interface LiveTranscriptDraftDependencies {
  authorize: (input: {
    captureId: string;
    track: MeetingLiveTranscriptTrack;
  }) => Promise<MeetingLiveTranscriptAuthorization>;
  connect: (input: {
    authorization: MeetingLiveTranscriptAuthorization;
    onDisconnect: (reason: string) => void;
    onTranscript: (event: { itemId: string; text: string; type: "completed" | "delta" }) => void;
    onWritable: () => void;
  }) => Promise<LiveTranscriptConnection>;
  createPcmTap: (input: {
    mediaTrack: MediaStreamTrack;
    onFrame: (frame: Int16Array) => void;
    track: MeetingLiveTranscriptTrack;
  }) => Promise<LiveTranscriptPcmTap>;
  maxDraftTurns?: number;
  maxQueuedPcmBytesPerTrack?: number;
  maxReconnectAttempts?: number;
  maxReconnectDelayMs?: number;
  random?: () => number;
  reconnectDelayMs?: number;
  scheduleReconnect?: (callback: () => void, delayMs: number) => () => void;
  shouldReconnect?: (error: unknown) => boolean;
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

const DEFAULT_MAX_QUEUED_PCM_BYTES = 512 * 1024;
const DEFAULT_MAX_DRAFT_TURNS = 500;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 8;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const DEFAULT_RECONNECT_DELAY_MS = 1500;
const MAX_DRAFT_SECTIONS = 200;
const MAX_DRAFT_TURN_CHARS = 10_000;
const TRACKS: MeetingLiveTranscriptTrack[] = ["microphone", "system"];

class BoundedPcmQueue {
  private readonly frames: Int16Array[] = [];
  private readonly maxBytes: number;
  private sizeBytes = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  get bytes(): number {
    return this.sizeBytes;
  }

  clear(): void {
    this.frames.length = 0;
    this.sizeBytes = 0;
  }

  enqueue(frame: Int16Array): boolean {
    if (frame.byteLength > this.maxBytes || this.sizeBytes + frame.byteLength > this.maxBytes) {
      return false;
    }
    this.frames.push(frame);
    this.sizeBytes += frame.byteLength;
    return true;
  }

  peek(): Int16Array | undefined {
    return this.frames[0];
  }

  shift(): void {
    const frame = this.frames.shift();
    if (frame) {
      this.sizeBytes -= frame.byteLength;
    }
  }
}

const initialSnapshot = (): LiveTranscriptDraftSnapshot => ({
  captureId: null,
  droppedPcmFrames: 0,
  error: null,
  queuedPcmBytes: 0,
  sections: [],
  status: "idle",
  trackStatus: { microphone: "idle", system: "idle" },
  turns: [],
});

function publicError(reason: string): string {
  if (reason === "backpressure") {
    return "实时字幕处理暂时跟不上，录音仍在继续";
  }
  if (reason === "authorization") {
    return "实时字幕授权暂不可用，录音仍在继续";
  }
  return "实时字幕已中断，录音仍在继续";
}

function closeConnection(runtime: TrackRuntime): void {
  runtime.connection?.close();
  runtime.connection = null;
}

export function createLiveTranscriptDraft(dependencies: LiveTranscriptDraftDependencies) {
  const maxQueuedPcmBytes = dependencies.maxQueuedPcmBytesPerTrack ?? DEFAULT_MAX_QUEUED_PCM_BYTES;
  const runtimes: Record<MeetingLiveTranscriptTrack, TrackRuntime> = {
    microphone: {
      cancelReconnect: null,
      connection: null,
      generation: 0,
      mediaTrack: null,
      pcmTap: null,
      queue: new BoundedPcmQueue(maxQueuedPcmBytes),
      reconnectAttempts: 0,
      sectionId: null,
      status: "idle",
    },
    system: {
      cancelReconnect: null,
      connection: null,
      generation: 0,
      mediaTrack: null,
      pcmTap: null,
      queue: new BoundedPcmQueue(maxQueuedPcmBytes),
      reconnectAttempts: 0,
      sectionId: null,
      status: "idle",
    },
  };
  const listeners = new Set<(snapshot: LiveTranscriptDraftSnapshot) => void>();
  const scheduleReconnect =
    dependencies.scheduleReconnect ??
    ((callback: () => void, delayMs: number) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    });
  let snapshot = initialSnapshot();
  let sectionSequence = 0;

  const aggregateStatus = (): LiveTranscriptDraftStatus => {
    const statuses = TRACKS.map((track) => runtimes[track].status);
    if (statuses.includes("reconnecting")) {
      return "reconnecting";
    }
    if (statuses.includes("interrupted")) {
      return "interrupted";
    }
    if (statuses.every((status) => status === "live")) {
      return "live";
    }
    if (statuses.some((status) => status === "starting" || status === "live")) {
      return "starting";
    }
    return "idle";
  };

  const publish = (next: Partial<LiveTranscriptDraftSnapshot> = {}) => {
    snapshot = {
      ...snapshot,
      ...next,
      queuedPcmBytes: TRACKS.reduce((total, track) => total + runtimes[track].queue.bytes, 0),
      status: aggregateStatus(),
      trackStatus: {
        microphone: runtimes.microphone.status,
        system: runtimes.system.status,
      },
    };
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const stop = (): void => {
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
    snapshot = initialSnapshot();
    publish();
  };

  const appendTranscript = (
    track: MeetingLiveTranscriptTrack,
    sectionId: string,
    event: { itemId: string; text: string; type: "completed" | "delta" },
  ) => {
    const id = `${sectionId}:${event.itemId}`;
    const index = snapshot.turns.findIndex((turn) => turn.id === id);
    const turns = [...snapshot.turns];
    if (index === -1) {
      turns.push({
        final: event.type === "completed",
        id,
        sectionId,
        text: event.text.slice(0, MAX_DRAFT_TURN_CHARS),
        track,
      });
    } else {
      const current = turns[index] as LiveTranscriptDraftTurn;
      turns[index] = {
        ...current,
        final: event.type === "completed",
        text: (event.type === "completed" ? event.text : `${current.text}${event.text}`).slice(
          0,
          MAX_DRAFT_TURN_CHARS,
        ),
      };
    }
    const maxTurns = dependencies.maxDraftTurns ?? DEFAULT_MAX_DRAFT_TURNS;
    publish({ turns: turns.slice(-maxTurns) });
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
    publish();
    return true;
  };

  const scheduleTrackReconnect = (
    runtime: TrackRuntime,
    callback: () => void,
  ): (() => void) | null => {
    const maxAttempts = dependencies.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    if (runtime.reconnectAttempts >= maxAttempts) {
      return null;
    }
    const baseDelay = dependencies.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    const maxDelay = dependencies.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
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

    const interrupt = (reason: string, reconnect = true) => {
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        return;
      }
      runtime.generation += 1;
      closeConnection(runtime);
      runtime.queue.clear();
      runtime.status = "interrupted";
      publish({ error: publicError(reason) });
      if (reconnect && !runtime.cancelReconnect) {
        runtime.cancelReconnect = scheduleTrackReconnect(
          runtime,
          () => void connectTrack(track, true),
        );
      }
    };

    try {
      const authorization = await dependencies.authorize({ captureId, track });
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        return;
      }
      const connection = await dependencies.connect({
        authorization,
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
          runtime.status = "live";
          if (flush(track)) {
            publish({ error: null });
          } else {
            runtime.status = "interrupted";
            publish({ error: publicError("backpressure") });
          }
        },
      });
      if (runtime.generation !== generation || snapshot.captureId !== captureId) {
        connection.close();
        return;
      }
      runtime.connection = connection;
      runtime.status = "live";
      publish({ error: null });
      flush(track);
    } catch (error) {
      interrupt("authorization", dependencies.shouldReconnect?.(error) ?? true);
    }
  };

  const onFrame = (track: MeetingLiveTranscriptTrack, frame: Int16Array) => {
    const runtime = runtimes[track];
    if (runtime.connection && runtime.queue.bytes === 0 && runtime.connection.sendPcm(frame)) {
      return;
    }
    if (!runtime.queue.enqueue(frame)) {
      snapshot = { ...snapshot, droppedPcmFrames: snapshot.droppedPcmFrames + 1 };
    }
    if (runtime.connection) {
      runtime.status = "interrupted";
      publish({ error: publicError("backpressure") });
      return;
    }
    publish();
  };

  const start = async (input: {
    captureId: string;
    tracks: Record<MeetingLiveTranscriptTrack, MediaStreamTrack>;
  }): Promise<void> => {
    stop();
    snapshot = { ...initialSnapshot(), captureId: input.captureId };
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
        }
      }),
    );
  };

  return {
    getSnapshot: () => snapshot,
    observe: (listener: (next: LiveTranscriptDraftSnapshot) => void) => {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    stop,
  };
}

export type LiveTranscriptDraft = ReturnType<typeof createLiveTranscriptDraft>;
