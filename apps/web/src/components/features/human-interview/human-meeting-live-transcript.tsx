"use client";
/* oxlint-disable react-doctor/no-fetch-in-effect -- The invite-scoped draft is restored only after browser hydration and cannot be loaded server-side. */

import { IconAlertTriangle, IconSparkles } from "@tabler/icons-react";
import { useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Ref } from "react";
import {
  createBrowserPcmSidecar,
  connectHumanInterviewTranscriptRelay,
} from "@arc/meeting-live-transcript/browser";
import type { HumanInterviewTranscriptRelayAuthorization } from "@arc/meeting-live-transcript/browser";
import {
  createDurableLiveTranscriptDraft,
  createLiveTranscriptDraft,
} from "@arc/meeting-live-transcript/draft";
import type { LiveTranscriptDraftSnapshot } from "@arc/meeting-live-transcript/draft";
import { meetingLiveTranscriptDraftSchema } from "@arc/shared/meeting-transcription";
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import { cn } from "@arc/shared/utils";
import { z } from "zod";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createHumanMeetingAudioMix } from "./human-meeting-audio-mix";
import type { HumanMeetingAudioMix } from "./human-meeting-audio-mix";

interface HumanMeetingLiveTranscriptProps {
  inviteToken: string;
  ref?: Ref<HumanMeetingLiveTranscriptHandle>;
}

export interface HumanMeetingLiveTranscriptHandle {
  flush: () => Promise<void>;
}

interface HumanMeetingAudioMixPair {
  local: HumanMeetingAudioMix;
  remote: HumanMeetingAudioMix;
}

const DRAFT_SAVE_DELAY_MS = 1500;
const START_RETRY_DELAY_MS = 3000;
const persistedDraftResponseSchema = z.object({
  draft: meetingLiveTranscriptDraftSchema.nullable(),
  version: z.number().int().nonnegative(),
});
const persistedDraftSaveResponseSchema = z.object({ version: z.number().int().positive() });

class LiveTranscriptDraftConflictError extends Error {
  override readonly name = "LiveTranscriptDraftConflictError";
}

function draftPath(inviteToken: string): string {
  return `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/live-transcript-draft`;
}

async function loadPersistedDraft(
  inviteToken: string,
): Promise<z.infer<typeof persistedDraftResponseSchema>> {
  const response = await fetch(draftPath(inviteToken), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("实时字幕草稿加载失败");
  }
  const parsed = persistedDraftResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("实时字幕草稿响应无效");
  }
  return parsed.data;
}

async function savePersistedDraft(
  inviteToken: string,
  draft: MeetingLiveTranscriptDraft,
  expectedVersion: number,
  keepalive = false,
): Promise<number> {
  const response = await fetch(draftPath(inviteToken), {
    body: JSON.stringify({ draft, expectedVersion }),
    headers: { "Content-Type": "application/json" },
    keepalive,
    method: "PUT",
  });
  if (response.status === 409) {
    throw new LiveTranscriptDraftConflictError("实时字幕草稿已在其他窗口更新");
  }
  if (!response.ok) {
    throw new Error("实时字幕草稿保存失败");
  }
  const parsed = persistedDraftSaveResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("实时字幕草稿保存响应无效");
  }
  return parsed.data.version;
}

function createDraft(inviteToken: string) {
  return createLiveTranscriptDraft<HumanInterviewTranscriptRelayAuthorization>({
    authorize: ({ captureId, track }) => Promise.resolve({ captureId, inviteToken, track }),
    connect: connectHumanInterviewTranscriptRelay,
    createPcmTap: createBrowserPcmSidecar,
    shouldReconnect: () => true,
  });
}

function initialSnapshot(): LiveTranscriptDraftSnapshot {
  return {
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
  };
}

const fallbackSnapshot = initialSnapshot();
const statusText = {
  buffering: "网络缓冲中",
  degraded: "连接不稳定",
  idle: "等待音频",
  interrupted: "转录已中断",
  live: "实时转录中",
  reconnecting: "正在重连",
  starting: "正在连接",
} satisfies Record<LiveTranscriptDraftSnapshot["status"], string>;

// oxlint-disable-next-line complexity -- Automatic capture, draft recovery, and persistence share one panel lifecycle.
export function HumanMeetingLiveTranscript({ inviteToken, ref }: HumanMeetingLiveTranscriptProps) {
  const draft = useMemo(() => createDraft(inviteToken), [inviteToken]);
  const snapshot = useSyncExternalStore(draft.observe, draft.getSnapshot, () => fallbackSnapshot);
  const audioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const [loadedDraft, setLoadedDraft] = useState<{
    draft: MeetingLiveTranscriptDraft | null;
    inviteToken: string;
    version: number;
  } | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const mixRef = useRef<HumanMeetingAudioMixPair | null>(null);
  const persistConflictRef = useRef(false);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistedVersionRef = useRef(0);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const startInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const draftReady = loadedDraft?.inviteToken === inviteToken;
  const initialDraft = draftReady ? loadedDraft.draft : null;
  const localTrack = useMemo(
    () =>
      audioTracks.find((track) => track.participant.isLocal)?.publication?.track?.mediaStreamTrack,
    [audioTracks],
  );
  const remoteTracks = useMemo(
    () =>
      audioTracks.flatMap((track) => {
        const mediaTrack = track.publication?.track?.mediaStreamTrack;
        return !track.participant.isLocal && mediaTrack ? [mediaTrack] : [];
      }),
    [audioTracks],
  );

  const persistDraft = useCallback(
    (value: MeetingLiveTranscriptDraft, keepalive = false) => {
      if (persistConflictRef.current) {
        return persistQueueRef.current;
      }
      const previous = persistQueueRef.current;
      persistQueueRef.current = (async () => {
        try {
          await previous;
        } catch {
          // A failed older snapshot must not block the newest snapshot.
        }
        try {
          const version = await savePersistedDraft(
            inviteToken,
            value,
            persistedVersionRef.current,
            keepalive,
          );
          persistedVersionRef.current = version;
          if (mountedRef.current) {
            setPersistenceError(null);
          }
        } catch (error) {
          if (error instanceof LiveTranscriptDraftConflictError) {
            persistConflictRef.current = true;
          }
          if (mountedRef.current) {
            setPersistenceError(
              error instanceof LiveTranscriptDraftConflictError
                ? "另一窗口正在保存实时字幕，本窗口不会覆盖其内容；完整录音不受影响。"
                : "实时字幕草稿暂时无法保存，完整录音不受影响。",
            );
          }
        }
      })();
      return persistQueueRef.current;
    },
    [inviteToken],
  );

  useImperativeHandle(
    ref,
    () => ({
      flush: async () => {
        const durable = createDurableLiveTranscriptDraft(draft.getSnapshot());
        if (durable) {
          await persistDraft(durable);
        }
      },
    }),
    [draft, persistDraft],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const value = await loadPersistedDraft(inviteToken);
        if (active) {
          persistedVersionRef.current = value.version;
          persistConflictRef.current = false;
          setLoadedDraft({ ...value, inviteToken });
          setPersistenceError(null);
        }
      } catch {
        if (active) {
          persistedVersionRef.current = 0;
          persistConflictRef.current = false;
          setLoadedDraft({ draft: null, inviteToken, version: 0 });
          setPersistenceError("实时字幕草稿暂时无法恢复，将从当前对话继续记录。");
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [inviteToken]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ block: "end" });
  }, [snapshot.turns]);

  useEffect(() => {
    const mix = mixRef.current;
    if (!mix) {
      return;
    }
    mix.local.setTracks(localTrack ? [localTrack] : []);
    mix.remote.setTracks(remoteTracks);
  }, [localTrack, remoteTracks]);

  useEffect(() => {
    const microphoneTrack = localTrack;
    if (
      !draftReady ||
      snapshot.captureId ||
      !microphoneTrack ||
      remoteTracks.length === 0 ||
      startInFlightRef.current
    ) {
      return;
    }
    const activeMicrophoneTrack = microphoneTrack;
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    startInFlightRef.current = true;
    setOperationError(null);
    async function start(): Promise<void> {
      try {
        const localMix = await createHumanMeetingAudioMix([activeMicrophoneTrack]);
        let remoteMix: HumanMeetingAudioMix;
        try {
          remoteMix = await createHumanMeetingAudioMix(remoteTracks);
        } catch (error) {
          localMix.stop();
          throw error;
        }
        mixRef.current?.local.stop();
        mixRef.current?.remote.stop();
        const pair = { local: localMix, remote: remoteMix };
        mixRef.current = pair;
        try {
          await draft.start({
            captureId: crypto.randomUUID(),
            initialDraft,
            tracks: { microphone: localMix.mediaTrack, system: remoteMix.mediaTrack },
          });
        } catch (error) {
          pair.local.stop();
          pair.remote.stop();
          if (mixRef.current === pair) {
            mixRef.current = null;
          }
          throw error;
        }
      } catch (error) {
        if (active) {
          setOperationError(
            error instanceof Error ? error.message : "实时转录启动失败，正在重试。",
          );
          retryTimer = setTimeout(() => {
            setRetryAttempt((attempt) => attempt + 1);
          }, START_RETRY_DELAY_MS);
        }
      } finally {
        startInFlightRef.current = false;
      }
    }
    void start();
    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [draft, draftReady, initialDraft, localTrack, remoteTracks, retryAttempt, snapshot.captureId]);

  useEffect(() => {
    const durable = createDurableLiveTranscriptDraft(snapshot);
    if (!durable) {
      return;
    }
    const timer = setTimeout(() => {
      persistDraft(durable);
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [persistDraft, snapshot]);

  useEffect(
    () => () => {
      const durable = createDurableLiveTranscriptDraft(draft.getSnapshot());
      if (durable) {
        void persistDraft(durable, true);
      }
      draft.stop();
      mixRef.current?.local.stop();
      mixRef.current?.remote.stop();
      mixRef.current = null;
    },
    [draft, persistDraft],
  );

  const hasStarted = snapshot.captureId !== null;
  const prerequisiteReady = Boolean(localTrack && remoteTracks.length > 0) || hasStarted;
  const prerequisiteMessage = localTrack
    ? "等待候选人或其他参会者开启麦克风，检测到音频后会自动开始转录。"
    : "正在等待面试官麦克风，检测到音频后会自动开始转录。";
  let status = statusText[snapshot.status];
  if (operationError) {
    status = "启动异常，正在自动重试";
  }
  if (!draftReady) {
    status = "正在恢复实时字幕";
  }

  return (
    <aside className="absolute top-3 right-3 bottom-3 z-40 flex w-[min(25rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-950/95 shadow-2xl backdrop-blur-xl">
      <header className="flex items-center justify-between border-white/10 border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-2 font-medium text-sm text-white">
            <IconSparkles className="size-4 text-sky-300" />
            实时转录
          </div>
          <p className="mt-1 text-[11px] text-white/50">已自动开启 · 最终结果以会后转录为准</p>
        </div>
      </header>

      <div className="flex items-center gap-2 border-white/10 border-b px-4 py-2.5 text-xs">
        <span
          className={cn(
            "size-2 rounded-full bg-white/30",
            snapshot.status === "live" && "animate-pulse bg-emerald-400",
            ["buffering", "reconnecting", "starting"].includes(snapshot.status) && "bg-amber-400",
            ["degraded", "interrupted"].includes(snapshot.status) && "bg-red-400",
          )}
        />
        <span className="text-white/70">{status}</span>
      </div>

      {prerequisiteReady ? null : (
        <div className="m-4 flex gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-amber-100 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{prerequisiteMessage}</span>
        </div>
      )}

      {(operationError ?? snapshot.error) ? (
        <div className="mx-4 mt-3 rounded-lg border border-red-300/20 bg-red-400/10 p-3 text-red-100 text-xs">
          {operationError ?? snapshot.error}
        </div>
      ) : null}

      {persistenceError ? (
        <div className="mx-4 mt-3 rounded-lg border border-amber-300/20 bg-amber-400/10 p-3 text-amber-100 text-xs">
          {persistenceError}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 px-4 py-3">
        {snapshot.turns.length === 0 ? (
          <div className="grid min-h-48 place-items-center text-center text-white/40 text-xs">
            <p>双方开始交谈后，这里会自动显示实时字幕。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshot.turns.map((turn) => (
              <div className="text-sm" key={turn.id}>
                <div className="mb-1 text-[11px] text-white/40">
                  {turn.track === "microphone" ? "我" : "远端"}
                </div>
                <p className={cn("leading-6 text-white/90", !turn.final && "text-white/55")}>
                  {turn.text}
                </p>
              </div>
            ))}
            <div ref={scrollEndRef} />
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
