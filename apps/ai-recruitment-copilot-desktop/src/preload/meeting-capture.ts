// oxlint-disable max-lines, promise/prefer-await-to-then, promise/prefer-await-to-callbacks -- The observable state machine publishes around durable promise transitions.
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import type { LocalMeetingSession } from "./local-meeting-session";

export const CAPTURE_FRAGMENT_DURATION_MS = 15_000;
export const MEETING_CAPTURE_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
export const SYSTEM_SILENCE_WARNING_MS = 6000;
export const AUDIBLE_LEVEL_THRESHOLD = 0.005;

export type CaptureTrack = "microphone" | "system";
export type CapturePhase =
  | "idle"
  | "starting"
  | "active"
  | "paused"
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
  manifestSha256?: string;
  possibleTailGap: boolean;
  recruitingRecordId: string | null;
  recoveryCopyDeleteAfter: string | null;
  startedAt: string;
  status: "interrupted" | "saved-local";
  tracks: Record<CaptureTrack, RecordingTrackSummary>;
}

export interface MeetingCaptureSnapshot {
  active: ActiveMeetingCapture | null;
  error: string | null;
  localSessions: LocalMeetingSession[];
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
  recoveryCopyDeleteAfter: string | null;
  state: WorkspaceSavePhase;
}

export interface WorkspaceRecordingPort {
  persist: (input: {
    captureId: string;
    manifestSha256: string;
    report: (state: Extract<WorkspaceSavePhase, "uploading" | "verifying">) => void;
  }) => Promise<{ recoveryCopyDeleteAfter: string }>;
  reportRecoveryCopyCleanup?: (
    captureId: string,
    manifestSha256: string,
    status: "deleted" | "failed",
  ) => Promise<void>;
  shouldDeleteRecoveryCopy?: (captureId: string, manifestSha256: string) => Promise<boolean>;
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
  getLiveTranscriptDraft?: () => MeetingLiveTranscriptDraft | null;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  start: (
    sink: CaptureSink,
    input: { captureId: string; initialLiveTranscriptDraft?: MeetingLiveTranscriptDraft | null },
  ) => Promise<void>;
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
  acknowledgeRemoteVisibility?: (captureId: string) => Promise<void> | void;
  append: (input: AppendLocalFragmentInput, bytes: Uint8Array) => Promise<void>;
  begin: (input: BeginLocalCaptureInput) => Promise<void>;
  discard: (captureId: string) => Promise<void>;
  markWorkspaceVerified: (captureId: string, recoveryCopyDeleteAfter: string) => Promise<void>;
  listLocalSessions?: () => LocalMeetingSession[] | Promise<LocalMeetingSession[]>;
  recover: () => Promise<RecoverableMeetingCapture[]>;
  resumeInterrupted?: (
    captureId: string,
    trackContentTypes: Record<CaptureTrack, string>,
  ) => Promise<void> | void;
  rollbackInterruptedResume?: (captureId: string) => Promise<void> | void;
  save: (
    captureId: string,
    liveTranscriptDraft?: MeetingLiveTranscriptDraft | null,
  ) => Promise<LocalSavedMeeting>;
  updateLocalSession?: (
    captureId: string,
    patch: Partial<
      Pick<
        LocalMeetingSession,
        "endedAt" | "liveTranscriptDraft" | "segmentCount" | "state" | "title"
      >
    >,
  ) => LocalMeetingSession | Promise<LocalMeetingSession>;
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
  liveTranscriptDraft?: MeetingLiveTranscriptDraft | null;
}

export interface MeetingCapture {
  acknowledgeRemoteVisibility: (captureId: string) => Promise<void>;
  continueInterrupted: (captureId: string) => Promise<void>;
  discard: (input?: DiscardMeetingCaptureInput) => Promise<void>;
  observe: (listener: (snapshot: MeetingCaptureSnapshot) => void) => () => void;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  save: (input?: SaveMeetingCaptureInput) => Promise<LocalSavedMeeting>;
  /** Returns the new captureId (also used as the workspace meeting id after upload). */
  start: (input?: StartMeetingCaptureInput) => Promise<{ captureId: string }>;
  updateLocalSession: (
    captureId: string,
    patch: Parameters<NonNullable<MeetingRecordingStore["updateLocalSession"]>>[1],
  ) => Promise<LocalMeetingSession | null>;
}

interface CreateMeetingCaptureInput {
  diagnostics?: (event: MeetingCaptureMetric) => void;
  idFactory?: () => string;
  maxDurationMs?: number;
  now?: () => Date;
  source: MeetingCaptureSource;
  store: MeetingRecordingStore;
  workspace?: WorkspaceRecordingPort;
}

export type MeetingCaptureMetric =
  | {
      committedGapMs: number;
      name: "meeting.capture.saved";
      spoolBytes: number;
    }
  | {
      name: "meeting.capture.recovery";
      outcome: "cleanup-failed" | "deleted" | "retained" | "scan-failed";
      possibleTailGap: boolean;
    }
  | {
      name: "meeting.capture.workspace-verified";
      saveToUploadMs: number;
    };

const initialSnapshot = (): MeetingCaptureSnapshot => ({
  active: null,
  error: null,
  localSessions: [],
  phase: "idle",
  recoverable: [],
  recoveryComplete: false,
  saved: null,
  workspaceSaves: [],
});

function asRecoverable(saved: LocalSavedMeeting): RecoverableMeetingCapture {
  return {
    captureId: saved.captureId,
    manifestSha256: saved.manifestSha256,
    possibleTailGap: saved.possibleTailGap,
    recoveryCopyDeleteAfter: null,
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

/**
 * Preload 层录制协调器：连接 Renderer 采集源与 Main 本地存储，并发布可观察的单一状态快照。
 * Preload capture coordinator joining the renderer media source to main-process storage through one observable snapshot.
 *
 * Save 与 Discard 是互斥终态；录音先本地冻结，工作区上传失败不会破坏 Recovery Copy。
 * Save and Discard are mutually exclusive terminals; local freezing succeeds independently of workspace upload.
 */
export function createMeetingCapture({
  diagnostics = (event) => console.info("[meeting-capture-metric]", event),
  idFactory = () => globalThis.crypto.randomUUID(),
  maxDurationMs = MEETING_CAPTURE_MAX_DURATION_MS,
  now = () => new Date(),
  source,
  store,
  workspace,
}: CreateMeetingCaptureInput): MeetingCapture {
  let snapshot = initialSnapshot();
  let prepared: PreparedCapture | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let durationTimer: ReturnType<typeof setTimeout> | null = null;
  let savePromise: Promise<LocalSavedMeeting> | null = null;
  let discardPromise: Promise<void> | null = null;
  let terminalOperation: "discard" | "save" | null = null;
  const pendingFragments = new Set<Promise<void>>();
  const listeners = new Set<(next: MeetingCaptureSnapshot) => void>();
  const workspaceOperations = new Map<string, Promise<void>>();
  const recoveryCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const reportSavedMetric = (saved: LocalSavedMeeting): void => {
    diagnostics({
      committedGapMs: Math.abs(
        saved.tracks.microphone.committedThroughMs - saved.tracks.system.committedThroughMs,
      ),
      name: "meeting.capture.saved",
      spoolBytes: saved.tracks.microphone.bytes + saved.tracks.system.bytes,
    });
  };

  const publish = (next: MeetingCaptureSnapshot) => {
    snapshot = next;
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const patch = (next: Partial<MeetingCaptureSnapshot>) => {
    publish({ ...snapshot, ...next });
  };

  const refreshLocalSessions = async (): Promise<void> => {
    if (store.listLocalSessions) {
      patch({ localSessions: await store.listLocalSessions() });
    }
  };

  const patchWorkspaceSave = (
    captureId: string,
    next: Omit<WorkspaceSaveState, "captureId" | "recoveryCopyDeleteAfter"> &
      Partial<Pick<WorkspaceSaveState, "recoveryCopyDeleteAfter">>,
  ) => {
    const existing = snapshot.workspaceSaves.find((item) => item.captureId === captureId);
    const retained = snapshot.workspaceSaves.filter((item) => item.captureId !== captureId);
    patch({
      workspaceSaves: [
        ...retained,
        {
          captureId,
          recoveryCopyDeleteAfter:
            next.recoveryCopyDeleteAfter ?? existing?.recoveryCopyDeleteAfter ?? null,
          ...next,
        },
      ],
    });
  };

  const clearRecoveryCleanup = (captureId: string) => {
    const timer = recoveryCleanupTimers.get(captureId);
    if (timer) {
      clearTimeout(timer);
      recoveryCleanupTimers.delete(captureId);
    }
  };

  const reportRecoveryCopyCleanup = async (
    captureId: string,
    manifestSha256: string,
    status: "deleted" | "failed",
  ): Promise<void> => {
    try {
      await workspace?.reportRecoveryCopyCleanup?.(captureId, manifestSha256, status);
    } catch (reportError) {
      console.warn("[meeting-capture] local recovery cleanup report failed", {
        errorName: reportError instanceof Error ? reportError.name : "UnknownError",
      });
    }
  };

  const scheduleRecoveryCleanup = (captureId: string, deadline: string): void => {
    clearRecoveryCleanup(captureId);
    const remainingMs = Date.parse(deadline) - now().getTime();
    const delayMs = Math.max(0, Math.min(remainingMs, 2_147_000_000));
    const timer = setTimeout(() => {
      recoveryCleanupTimers.delete(captureId);
      if (remainingMs > delayMs) {
        scheduleRecoveryCleanup(captureId, deadline);
        return;
      }
      void store
        .discard(captureId)
        .then(() => {
          patch({
            phase: snapshot.active ? snapshot.phase : "idle",
            recoverable: snapshot.recoverable.filter((item) => item.captureId !== captureId),
            saved: snapshot.saved?.captureId === captureId ? null : snapshot.saved,
            workspaceSaves: snapshot.workspaceSaves.filter((item) => item.captureId !== captureId),
          });
        })
        .catch((error: unknown) => {
          patch({
            error:
              error instanceof Error ? error.message : "Local Recording Recovery Copy 自动清理失败",
          });
        });
    }, delayMs);
    recoveryCleanupTimers.set(captureId, timer);
  };

  const persistToWorkspace = (saved: LocalSavedMeeting): void => {
    // 工作区保存是本地提交后的可重试副作用，不属于录音成功的提交条件。
    // Workspace persistence is a retryable post-commit side effect, not a prerequisite for local capture success.
    if (!workspace || workspaceOperations.has(saved.captureId)) {
      return;
    }
    const current = snapshot.workspaceSaves.find((item) => item.captureId === saved.captureId);
    if (current?.state === "workspace-verified") {
      return;
    }
    patchWorkspaceSave(saved.captureId, { error: null, state: "waiting-for-network" });
    const uploadingSession = store.updateLocalSession?.(saved.captureId, { state: "uploading" });
    if (uploadingSession) {
      void Promise.resolve(uploadingSession).then(() => refreshLocalSessions());
    }
    const operation = workspace
      .persist({
        captureId: saved.captureId,
        manifestSha256: saved.manifestSha256,
        report: (state) => patchWorkspaceSave(saved.captureId, { error: null, state }),
      })
      .then(async (result) => {
        await store.markWorkspaceVerified(saved.captureId, result.recoveryCopyDeleteAfter);
        await refreshLocalSessions();
        diagnostics({
          name: "meeting.capture.workspace-verified",
          saveToUploadMs: Math.max(0, now().getTime() - Date.parse(saved.savedAt)),
        });
        patchWorkspaceSave(saved.captureId, {
          error: null,
          recoveryCopyDeleteAfter: result.recoveryCopyDeleteAfter,
          state: "workspace-verified",
        });
      })
      .catch(async (error: unknown) => {
        const failedSession = store.updateLocalSession?.(saved.captureId, {
          state: "sync-failed",
        });
        if (failedSession) {
          await failedSession;
          await refreshLocalSessions();
        }
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

  const reconcileRecoveryCopy = async (capture: RecoverableMeetingCapture): Promise<boolean> => {
    if (
      !(
        capture.manifestSha256 &&
        capture.recoveryCopyDeleteAfter &&
        workspace?.shouldDeleteRecoveryCopy
      )
    ) {
      return true;
    }
    let deleteRequired = false;
    try {
      deleteRequired = await workspace.shouldDeleteRecoveryCopy(
        capture.captureId,
        capture.manifestSha256,
      );
    } catch {
      return true;
    }
    if (!deleteRequired) {
      return true;
    }
    try {
      await store.discard(capture.captureId);
    } catch (error) {
      diagnostics({
        name: "meeting.capture.recovery",
        outcome: "cleanup-failed",
        possibleTailGap: capture.possibleTailGap,
      });
      await workspace
        .reportRecoveryCopyCleanup?.(capture.captureId, capture.manifestSha256, "failed")
        .catch((reportError: unknown) => {
          console.warn("[meeting-capture] local recovery cleanup report failed", {
            errorName: reportError instanceof Error ? reportError.name : "UnknownError",
          });
        });
      patch({
        error: error instanceof Error ? error.message : "Local Recording Recovery Copy 清理失败",
      });
      return true;
    }
    await workspace
      .reportRecoveryCopyCleanup?.(capture.captureId, capture.manifestSha256, "deleted")
      .catch((reportError: unknown) => {
        console.warn("[meeting-capture] local recovery cleanup report failed", {
          errorName: reportError instanceof Error ? reportError.name : "UnknownError",
        });
      });
    diagnostics({
      name: "meeting.capture.recovery",
      outcome: "deleted",
      possibleTailGap: capture.possibleTailGap,
    });
    return false;
  };

  const ready = store
    .recover()
    .then(async (recoverable) => {
      const retained: RecoverableMeetingCapture[] = [];
      for (const capture of recoverable) {
        if (await reconcileRecoveryCopy(capture)) {
          retained.push(capture);
          diagnostics({
            name: "meeting.capture.recovery",
            outcome: "retained",
            possibleTailGap: capture.possibleTailGap,
          });
        }
      }
      patch({ recoverable: retained, recoveryComplete: true });
      await refreshLocalSessions();
      for (const capture of retained) {
        if (capture.recoveryCopyDeleteAfter) {
          scheduleRecoveryCleanup(capture.captureId, capture.recoveryCopyDeleteAfter);
        }
        if (capture.status === "saved-local" && !capture.recoveryCopyDeleteAfter) {
          persistToWorkspace(await store.save(capture.captureId));
        }
      }
    })
    .catch((error: unknown) => {
      diagnostics({
        name: "meeting.capture.recovery",
        outcome: "scan-failed",
        possibleTailGap: false,
      });
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

  const clearDurationTimer = () => {
    if (durationTimer) {
      clearTimeout(durationTimer);
      durationTimer = null;
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

  const start = async (input: StartMeetingCaptureInput = {}): Promise<{ captureId: string }> => {
    await ready;
    if (
      terminalOperation ||
      snapshot.active ||
      snapshot.phase === "starting" ||
      snapshot.phase === "saving" ||
      snapshot.phase === "discarding"
    ) {
      throw new Error("已有录制正在进行");
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
      await refreshLocalSessions();
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
      await acquired.start(sink, { captureId });
      patch({ phase: "active" });
      console.info("[meeting-capture-renderer] recording active", {
        captureId,
        recruitingRecordId: input.recruitingRecordId ?? null,
        videoTracksDiscarded: acquired.videoTracksDiscarded,
      });
      durationTimer = setTimeout(() => {
        durationTimer = null;
        // oxlint-disable-next-line no-use-before-define -- Duration guard invokes the same terminal Save path.
        void save({ captureId }).catch(() => {
          // Save publishes a safe action-required error while retaining the durable spool.
        });
      }, maxDurationMs);
      silenceTimer = setTimeout(() => {
        if (snapshot.active?.tracks.system.health === "checking") {
          updateTrack("system", { health: "silent" });
        }
      }, SYSTEM_SILENCE_WARNING_MS);
      return { captureId };
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
        await refreshLocalSessions();
        clearRecoveryCleanup(captureId);
      } catch {
        // Best effort when begin did not reach durable spool creation.
      }
      prepared = null;
      clearDurationTimer();
      const message = error instanceof Error ? error.message : "无法开始录制";
      console.error("[meeting-capture-renderer] recording start failed", {
        captureId,
        errorMessage: message,
      });
      patch({ active: null, error: message, phase: "error" });
      throw error;
    }
  };

  const continueInterrupted = async (captureId: string): Promise<void> => {
    await ready;
    const recovered = snapshot.recoverable.find(
      (item) => item.captureId === captureId && item.status === "interrupted",
    );
    if (
      !recovered ||
      terminalOperation ||
      snapshot.active ||
      snapshot.phase === "starting" ||
      snapshot.phase === "saving" ||
      snapshot.phase === "discarding"
    ) {
      throw new Error("当前没有可继续的中断录制");
    }
    if (!(store.resumeInterrupted && store.rollbackInterruptedResume)) {
      throw new Error("当前录制存储不支持继续中断录制");
    }

    patch({ error: null, phase: "starting" });
    let acquired: PreparedCapture | null = null;
    let resumedStore = false;
    try {
      acquired = await source.acquire();
      await store.resumeInterrupted(captureId, acquired.trackContentTypes);
      resumedStore = true;
      const active: ActiveMeetingCapture = {
        captureId,
        recruitingRecordId: recovered.recruitingRecordId,
        startedAt: recovered.startedAt,
        tracks: {
          microphone: { health: "checking", level: 0 },
          system: { health: "checking", level: 0 },
        },
        videoTracksPersisted: 0,
      };
      prepared = acquired;
      patch({
        active,
        recoverable: snapshot.recoverable.filter((item) => item.captureId !== captureId),
      });
      const continuationSink: CaptureSink = {
        ...sink,
        fragment: (fragment) => {
          const previous = recovered.tracks[fragment.track];
          return sink.fragment({
            ...fragment,
            endedAtMonotonicMs: previous.committedThroughMs + fragment.endedAtMonotonicMs,
            sequence: previous.fragmentCount + fragment.sequence,
            startedAtMonotonicMs: previous.committedThroughMs + fragment.startedAtMonotonicMs,
          });
        },
      };
      const initialLiveTranscriptDraft = snapshot.localSessions.find(
        (session) => session.id === captureId,
      )?.liveTranscriptDraft;
      await acquired.start(continuationSink, { captureId, initialLiveTranscriptDraft });
      await refreshLocalSessions();
      patch({ phase: "active" });
      const committedMs = Math.max(
        recovered.tracks.microphone.committedThroughMs,
        recovered.tracks.system.committedThroughMs,
      );
      durationTimer = setTimeout(
        () => {
          durationTimer = null;
          // oxlint-disable-next-line no-use-before-define -- Duration guard invokes the same terminal Save path.
          void save({ captureId }).catch(() => {
            // Save publishes an actionable error while retaining the durable spool.
          });
        },
        Math.max(1, maxDurationMs - committedMs),
      );
      silenceTimer = setTimeout(() => {
        if (snapshot.active?.tracks.system.health === "checking") {
          updateTrack("system", { health: "silent" });
        }
      }, SYSTEM_SILENCE_WARNING_MS);
    } catch (error) {
      let recoverable = snapshot.recoverable.some((item) => item.captureId === captureId)
        ? snapshot.recoverable
        : [recovered, ...snapshot.recoverable];
      if (acquired) {
        await acquired.dispose().catch(() => {
          // The original resume error remains primary.
        });
      }
      if (resumedStore) {
        await Promise.resolve(store.rollbackInterruptedResume(captureId)).catch(() => {
          // Recovery reconciles a remaining recording manifest on the next app start.
        });
        await store
          .recover()
          .then((next) => {
            recoverable = next;
          })
          .catch(() => {
            // Keep the last known recovery entry if the rescan itself fails.
          });
      }
      prepared = null;
      clearDurationTimer();
      clearSilenceTimer();
      await refreshLocalSessions();
      patch({
        active: null,
        error: error instanceof Error ? error.message : "继续中断录制失败",
        phase: "error",
        recoverable,
      });
      throw error;
    }
  };

  const pause = async (): Promise<void> => {
    if (!(snapshot.active && prepared && snapshot.phase === "active")) {
      throw new Error("当前没有可暂停的录制");
    }
    await prepared.pause();
    clearSilenceTimer();
    await store.updateLocalSession?.(snapshot.active.captureId, { state: "paused" });
    await refreshLocalSessions();
    patch({ phase: "paused" });
  };

  const resume = async (): Promise<void> => {
    if (!(snapshot.active && prepared && snapshot.phase === "paused")) {
      throw new Error("当前没有可继续的暂停录制");
    }
    await prepared.resume();
    await store.updateLocalSession?.(snapshot.active.captureId, { state: "recording" });
    await refreshLocalSessions();
    patch({ phase: "active" });
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
          reportSavedMetric(saved);
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
      return Promise.reject(new Error("当前没有正在进行的录制"));
    }

    if (input.captureId && input.captureId !== snapshot.active.captureId) {
      return Promise.reject(new Error("不能在录制期间保存另一场恢复录音"));
    }

    const { captureId } = snapshot.active;
    const { active } = snapshot;
    const capture = prepared;
    clearSilenceTimer();
    clearDurationTimer();
    terminalOperation = "save";
    patch({ error: null, phase: "saving" });
    savePromise = (async () => {
      try {
        const saveStartedAt = Date.now();
        const liveTranscriptDraft =
          input.liveTranscriptDraft === undefined
            ? (capture.getLiveTranscriptDraft?.() ?? null)
            : input.liveTranscriptDraft;
        await capture.stop();
        const stopElapsedMs = Date.now() - saveStartedAt;
        console.info("[meeting-capture-renderer] save: capture stopped", {
          pendingFragments: pendingFragments.size,
          stopElapsedMs,
        });
        await Promise.all(pendingFragments);
        console.info("[meeting-capture-renderer] save: fragments settled", {
          elapsedMs: Date.now() - saveStartedAt,
        });
        const saved = await store.save(captureId, liveTranscriptDraft);
        await refreshLocalSessions();
        console.info("[meeting-capture-renderer] save: local saved", {
          elapsedMs: Date.now() - saveStartedAt,
        });
        reportSavedMetric(saved);
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
    clearDurationTimer();
    terminalOperation = "discard";
    patch({ error: null, phase: "discarding" });
    discardPromise = (async () => {
      try {
        if (captureId === activeId && capture) {
          await capture.dispose();
          await Promise.allSettled(pendingFragments);
        }
        await store.discard(captureId);
        await refreshLocalSessions();
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
    acknowledgeRemoteVisibility: async (captureId) => {
      const manifestSha256 =
        snapshot.saved?.captureId === captureId
          ? snapshot.saved.manifestSha256
          : snapshot.recoverable.find((item) => item.captureId === captureId)?.manifestSha256;
      await store.acknowledgeRemoteVisibility?.(captureId);
      if (manifestSha256) {
        await reportRecoveryCopyCleanup(captureId, manifestSha256, "deleted");
      }
      await refreshLocalSessions();
      patch({
        phase: snapshot.active ? snapshot.phase : "idle",
        recoverable: snapshot.recoverable.filter((item) => item.captureId !== captureId),
        saved: snapshot.saved?.captureId === captureId ? null : snapshot.saved,
      });
    },
    continueInterrupted,
    discard,
    observe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    pause,
    resume,
    save,
    start,
    updateLocalSession: async (captureId, next) => {
      const updated = (await store.updateLocalSession?.(captureId, next)) ?? null;
      await refreshLocalSessions();
      return updated;
    },
  };
}
