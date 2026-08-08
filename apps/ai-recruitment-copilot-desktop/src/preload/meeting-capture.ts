// oxlint-disable promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- The observable state machine publishes around durable promise transitions.
export const CAPTURE_FRAGMENT_DURATION_MS = 15_000;
export const SYSTEM_SILENCE_WARNING_MS = 6000;
export const AUDIBLE_LEVEL_THRESHOLD = 0.005;

export type CaptureTrack = "microphone" | "system";
export type CapturePhase =
  | "idle"
  | "starting"
  | "active"
  | "saving"
  | "discarding"
  | "saved-local"
  | "error";
export type CaptureTrackHealth = "checking" | "healthy" | "silent" | "muted" | "ended";

export interface CaptureTrackState {
  health: CaptureTrackHealth;
  level: number;
}

export interface ActiveMeetingCapture {
  captureId: string;
  recruitingRecordId: string | null;
  startedAt: string;
  tracks: Record<CaptureTrack, CaptureTrackState>;
  videoTracksPersisted: 0;
}

export interface RecordingTrackSummary {
  bytes: number;
  committedThroughMs: number;
  fragmentCount: number;
}

export interface LocalSavedMeeting {
  captureId: string;
  container: {
    independentlyDecodableFragments: false;
    kind: "ordered-mediarecorder-stream";
  };
  manifestSha256: string;
  possibleTailGap: boolean;
  recruitingRecordId: string | null;
  savedAt: string;
  startedAt: string;
  status: "saved-local";
  tracks: Record<CaptureTrack, RecordingTrackSummary>;
}

export interface RecoverableMeetingCapture {
  captureId: string;
  possibleTailGap: boolean;
  recruitingRecordId: string | null;
  startedAt: string;
  status: "interrupted" | "saved-local";
  tracks: Record<CaptureTrack, RecordingTrackSummary>;
}

export interface MeetingCaptureSnapshot {
  active: ActiveMeetingCapture | null;
  error: string | null;
  phase: CapturePhase;
  recoverable: RecoverableMeetingCapture[];
  recoveryComplete: boolean;
  saved: LocalSavedMeeting | null;
  workspaceSaves: WorkspaceSaveState[];
}

export type WorkspaceSavePhase =
  | "waiting-for-network"
  | "uploading"
  | "verifying"
  | "workspace-verified"
  | "action-required";

export interface WorkspaceSaveState {
  captureId: string;
  error: string | null;
  state: WorkspaceSavePhase;
}

export interface WorkspaceRecordingPort {
  persist: (input: {
    captureId: string;
    manifestSha256: string;
    report: (state: Extract<WorkspaceSavePhase, "uploading" | "verifying">) => void;
  }) => Promise<void>;
}

export interface CaptureFragment {
  bytes: Uint8Array;
  durationMs: number;
  endedAtMonotonicMs: number;
  sequence: number;
  startedAtMonotonicMs: number;
  track: CaptureTrack;
}

export interface CaptureSink {
  failure: (error: Error) => void;
  fragment: (fragment: CaptureFragment) => Promise<void>;
  level: (input: { level: number; track: CaptureTrack }) => void;
  status: (input: {
    health: Extract<CaptureTrackHealth, "ended" | "muted">;
    track: CaptureTrack;
  }) => void;
}

export interface PreparedCapture {
  dispose: () => Promise<void>;
  start: (sink: CaptureSink) => Promise<void>;
  stop: () => Promise<void>;
  trackContentTypes: Record<CaptureTrack, string>;
  videoTracksDiscarded: number;
}

export interface MeetingCaptureSource {
  acquire: () => Promise<PreparedCapture>;
}

export interface BeginLocalCaptureInput {
  captureId: string;
  recruitingRecordId: string | null;
  startedAt: string;
  trackContentTypes: Record<CaptureTrack, string>;
  videoTracksDiscarded: number;
}

export interface AppendLocalFragmentInput extends Omit<CaptureFragment, "bytes"> {
  captureId: string;
  contentType: string;
}

export interface MeetingRecordingStore {
  append: (input: AppendLocalFragmentInput, bytes: Uint8Array) => Promise<void>;
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  save: (captureId: string) => Promise<LocalSavedMeeting>;
}

export interface StartMeetingCaptureInput {
  recruitingRecordId?: string | null;
}

export interface DiscardMeetingCaptureInput {
  captureId?: string;
  includeSaved?: boolean;
}

export interface SaveMeetingCaptureInput {
  captureId?: string;
}

export interface MeetingCapture {
  discard: (input?: DiscardMeetingCaptureInput) => Promise<void>;
  observe: (listener: (snapshot: MeetingCaptureSnapshot) => void) => () => void;
  save: (input?: SaveMeetingCaptureInput) => Promise<LocalSavedMeeting>;
  start: (input?: StartMeetingCaptureInput) => Promise<void>;
}

interface CreateMeetingCaptureInput {
  idFactory?: () => string;
  now?: () => Date;
  source: MeetingCaptureSource;
  store: MeetingRecordingStore;
  workspace?: WorkspaceRecordingPort;
}

const initialSnapshot = (): MeetingCaptureSnapshot => ({
  active: null,
  error: null,
  phase: "idle",
  recoverable: [],
  recoveryComplete: false,
  saved: null,
  workspaceSaves: [],
});

function asRecoverable(saved: LocalSavedMeeting): RecoverableMeetingCapture {
  return {
    captureId: saved.captureId,
    possibleTailGap: saved.possibleTailGap,
    recruitingRecordId: saved.recruitingRecordId,
    startedAt: saved.startedAt,
    status: saved.status,
    tracks: saved.tracks,
  };
}

function retainSaved(
  recoverable: RecoverableMeetingCapture[],
  saved: LocalSavedMeeting | null,
): RecoverableMeetingCapture[] {
  if (!saved || recoverable.some((item) => item.captureId === saved.captureId)) {
    return recoverable;
  }
  return [...recoverable, asRecoverable(saved)];
}

export function createMeetingCapture({
  idFactory = () => globalThis.crypto.randomUUID(),
  now = () => new Date(),
  source,
  store,
  workspace,
}: CreateMeetingCaptureInput): MeetingCapture {
  let snapshot = initialSnapshot();
  let prepared: PreparedCapture | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let savePromise: Promise<LocalSavedMeeting> | null = null;
  let discardPromise: Promise<void> | null = null;
  let terminalOperation: "discard" | "save" | null = null;
  const pendingFragments = new Set<Promise<void>>();
  const listeners = new Set<(next: MeetingCaptureSnapshot) => void>();
  const workspaceOperations = new Map<string, Promise<void>>();

  const publish = (next: MeetingCaptureSnapshot) => {
    snapshot = next;
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const patch = (next: Partial<MeetingCaptureSnapshot>) => {
    publish({ ...snapshot, ...next });
  };

  const patchWorkspaceSave = (captureId: string, next: Omit<WorkspaceSaveState, "captureId">) => {
    const current = snapshot.workspaceSaves.filter((item) => item.captureId !== captureId);
    patch({ workspaceSaves: [...current, { captureId, ...next }] });
  };

  const persistToWorkspace = (saved: LocalSavedMeeting): void => {
    if (!workspace || workspaceOperations.has(saved.captureId)) {
      return;
    }
    const current = snapshot.workspaceSaves.find((item) => item.captureId === saved.captureId);
    if (current?.state === "workspace-verified") {
      return;
    }
    patchWorkspaceSave(saved.captureId, { error: null, state: "waiting-for-network" });
    const operation = workspace
      .persist({
        captureId: saved.captureId,
        manifestSha256: saved.manifestSha256,
        report: (state) => patchWorkspaceSave(saved.captureId, { error: null, state }),
      })
      .then(() => {
        patchWorkspaceSave(saved.captureId, { error: null, state: "workspace-verified" });
      })
      .catch((error: unknown) => {
        patchWorkspaceSave(saved.captureId, {
          error: error instanceof Error ? error.message : "保存到工作区失败",
          state: "action-required",
        });
      })
      .finally(() => {
        workspaceOperations.delete(saved.captureId);
      });
    workspaceOperations.set(saved.captureId, operation);
  };

  const ready = store
    .recover()
    .then((recoverable) => {
      patch({ recoverable, recoveryComplete: true });
    })
    .catch((error: unknown) => {
      patch({
        error: error instanceof Error ? error.message : "无法扫描本地录音恢复目录",
        phase: "error",
        recoveryComplete: true,
      });
    });

  const clearSilenceTimer = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const updateTrack = (track: CaptureTrack, next: Partial<CaptureTrackState>) => {
    if (!snapshot.active) {
      return;
    }
    patch({
      active: {
        ...snapshot.active,
        tracks: {
          ...snapshot.active.tracks,
          [track]: { ...snapshot.active.tracks[track], ...next },
        },
      },
    });
  };

  const sink: CaptureSink = {
    failure: (error) => {
      if (terminalOperation !== "discard") {
        patch({ error: error.message, phase: "error" });
      }
    },
    fragment: async (fragment) => {
      const { active } = snapshot;
      if (!active || !prepared) {
        throw new Error("录制已结束，不能继续写入音频分片");
      }
      const operation = store.append(
        {
          captureId: active.captureId,
          contentType: prepared.trackContentTypes[fragment.track],
          durationMs: fragment.durationMs,
          endedAtMonotonicMs: fragment.endedAtMonotonicMs,
          sequence: fragment.sequence,
          startedAtMonotonicMs: fragment.startedAtMonotonicMs,
          track: fragment.track,
        },
        fragment.bytes,
      );
      pendingFragments.add(operation);
      try {
        await operation;
      } finally {
        pendingFragments.delete(operation);
      }
    },
    level: ({ level, track }) => {
      const health = level > AUDIBLE_LEVEL_THRESHOLD ? "healthy" : undefined;
      updateTrack(track, { ...(health ? { health } : {}), level });
    },
    status: ({ health, track }) => updateTrack(track, { health }),
  };

  const start = async (input: StartMeetingCaptureInput = {}) => {
    await ready;
    if (
      terminalOperation ||
      snapshot.active ||
      snapshot.phase === "starting" ||
      snapshot.phase === "saving" ||
      snapshot.phase === "discarding"
    ) {
      throw new Error("已有会议正在录制");
    }

    patch({
      error: null,
      phase: "starting",
      recoverable: retainSaved(snapshot.recoverable, snapshot.saved),
      saved: null,
    });
    const captureId = idFactory();
    let acquired: PreparedCapture | null = null;
    try {
      acquired = await source.acquire();
      const startedAt = now().toISOString();
      await store.begin({
        captureId,
        recruitingRecordId: input.recruitingRecordId ?? null,
        startedAt,
        trackContentTypes: acquired.trackContentTypes,
        videoTracksDiscarded: acquired.videoTracksDiscarded,
      });
      prepared = acquired;
      const active: ActiveMeetingCapture = {
        captureId,
        recruitingRecordId: input.recruitingRecordId ?? null,
        startedAt,
        tracks: {
          microphone: { health: "checking", level: 0 },
          system: { health: "checking", level: 0 },
        },
        videoTracksPersisted: 0,
      };
      patch({ active });
      await acquired.start(sink);
      patch({ phase: "active" });
      silenceTimer = setTimeout(() => {
        if (snapshot.active?.tracks.system.health === "checking") {
          updateTrack("system", { health: "silent" });
        }
      }, SYSTEM_SILENCE_WARNING_MS);
    } catch (error) {
      if (acquired) {
        try {
          await acquired.dispose();
        } catch {
          // Best effort after a failed start; the original capture error remains primary.
        }
      }
      try {
        await store.discard(captureId);
      } catch {
        // Best effort when begin did not reach durable spool creation.
      }
      prepared = null;
      const message = error instanceof Error ? error.message : "无法开始会议录制";
      patch({ active: null, error: message, phase: "error" });
      throw error;
    }
  };

  const save = (input: SaveMeetingCaptureInput = {}): Promise<LocalSavedMeeting> => {
    if (terminalOperation === "discard") {
      return Promise.reject(new Error("正在放弃录制，不能同时保存"));
    }
    if (snapshot.saved && (!input.captureId || input.captureId === snapshot.saved.captureId)) {
      persistToWorkspace(snapshot.saved);
      return Promise.resolve(snapshot.saved);
    }
    if (savePromise) {
      return savePromise;
    }
    const recovered = input.captureId
      ? snapshot.recoverable.find((item) => item.captureId === input.captureId)
      : undefined;
    if (recovered && !snapshot.active) {
      terminalOperation = "save";
      patch({ error: null, phase: "saving" });
      savePromise = store
        .save(recovered.captureId)
        .then((saved) => {
          const retained = retainSaved(
            snapshot.recoverable.filter((item) => item.captureId !== recovered.captureId),
            snapshot.saved,
          );
          patch({
            phase: "saved-local",
            recoverable: retained,
            saved,
          });
          persistToWorkspace(saved);
          return saved;
        })
        .catch((error: unknown) => {
          patch({
            error: error instanceof Error ? error.message : "保存恢复录音失败",
            phase: "error",
          });
          throw error;
        })
        .finally(() => {
          savePromise = null;
          terminalOperation = null;
        });
      return savePromise;
    }
    if (!snapshot.active || !prepared) {
      return Promise.reject(new Error("当前没有正在录制的会议"));
    }

    if (input.captureId && input.captureId !== snapshot.active.captureId) {
      return Promise.reject(new Error("不能在录制期间保存另一场恢复录音"));
    }

    const { captureId } = snapshot.active;
    const { active } = snapshot;
    const capture = prepared;
    clearSilenceTimer();
    terminalOperation = "save";
    patch({ error: null, phase: "saving" });
    savePromise = (async () => {
      try {
        await capture.stop();
        await Promise.all(pendingFragments);
        const saved = await store.save(captureId);
        await capture.dispose();
        prepared = null;
        patch({ active: null, phase: "saved-local", saved });
        persistToWorkspace(saved);
        return saved;
      } catch (error) {
        const message = error instanceof Error ? error.message : "保存本地录音失败";
        patch({ active, error: message, phase: "error" });
        throw error;
      } finally {
        savePromise = null;
        terminalOperation = null;
      }
    })();
    return savePromise;
  };

  const discard = (input: DiscardMeetingCaptureInput = {}): Promise<void> => {
    if (terminalOperation === "save" || snapshot.phase === "saving" || savePromise) {
      return Promise.reject(new Error("正在保存，不能同时放弃录制"));
    }
    if (discardPromise) {
      return discardPromise;
    }

    const activeId = snapshot.active?.captureId;
    const savedId = snapshot.saved?.captureId;
    const captureId = input.captureId ?? activeId ?? savedId;
    if (!captureId) {
      return Promise.resolve();
    }
    if (captureId === savedId && !input.includeSaved) {
      return Promise.reject(new Error("已保存的本地录音需要明确确认后才能放弃"));
    }

    const capture = prepared;
    clearSilenceTimer();
    terminalOperation = "discard";
    patch({ error: null, phase: "discarding" });
    discardPromise = (async () => {
      try {
        if (captureId === activeId && capture) {
          await capture.dispose();
          await Promise.allSettled(pendingFragments);
        }
        await store.discard(captureId);
        if (captureId === activeId && prepared === capture) {
          prepared = null;
        }
        patch({
          active: captureId === activeId ? null : snapshot.active,
          phase: snapshot.active && captureId !== activeId ? "active" : "idle",
          recoverable: snapshot.recoverable.filter((item) => item.captureId !== captureId),
          saved: captureId === savedId ? null : snapshot.saved,
          workspaceSaves: snapshot.workspaceSaves.filter((item) => item.captureId !== captureId),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "放弃本地录音失败";
        patch({ error: message, phase: "error" });
        throw error;
      } finally {
        discardPromise = null;
        terminalOperation = null;
      }
    })();
    return discardPromise;
  };

  return {
    discard,
    observe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    save,
    start,
  };
}
