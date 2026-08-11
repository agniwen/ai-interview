import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LocalAudioTrack } from "livekit-client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AgentAudioVisualizerBar } from "@/components/agents-ui/agent-audio-visualizer-bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CaptureTrack,
  CaptureTrackState,
  MeetingCaptureSnapshot,
  WorkspaceSaveState,
} from "../../../../../preload/meeting-capture";
import { cn } from "@arc/shared/utils";
import { observeCapturePreviewStreams } from "@/lib/meeting-capture/capture-preview-streams";
import type { CapturePreviewStreams } from "@/lib/meeting-capture/capture-preview-streams";
import { formatAppDateTime } from "@/lib/client/datetime";
import { MeetingRecordingComposerFrame } from "./meeting-recording-session-layout";

const HEALTH_LABEL: Record<CaptureTrackState["health"], string> = {
  checking: "检测中",
  ended: "已中断",
  healthy: "正常",
  muted: "已静音",
  silent: "疑似无声",
};

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatRecoveryDeadline(value: string): string {
  return formatAppDateTime(value);
}

export function useElapsed(startedAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? formatElapsed(now - new Date(startedAt).getTime()) : "00:00:00";
}

function useCapturePreviewStreams() {
  const [streams, setStreams] = useState<CapturePreviewStreams>({
    microphone: null,
    system: null,
  });
  useEffect(() => observeCapturePreviewStreams(setStreams), []);
  return streams;
}

function visualizerStateFor(
  health: CaptureTrackState["health"],
): "connecting" | "listening" | "speaking" {
  if (health === "checking") {
    return "connecting";
  }
  if (health === "silent" || health === "muted" || health === "ended") {
    return "listening";
  }
  return "speaking";
}

/** Wrap a capture MediaStream as LiveKit LocalAudioTrack without taking ownership of the track. */
function useLocalAudioTrackFromMediaStream(
  stream: MediaStream | null,
): LocalAudioTrack | undefined {
  const mediaTrack = stream?.getAudioTracks()[0] ?? null;
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | undefined>();

  useEffect(() => {
    if (!mediaTrack) {
      setAudioTrack(undefined);
      return;
    }
    const local = new LocalAudioTrack(mediaTrack, undefined, true);
    setAudioTrack(local);
    return () => {
      local.stop();
    };
  }, [mediaTrack]);

  return audioTrack;
}

function TrackMeter({
  label,
  mediaStream,
  state,
  track,
}: {
  label: string;
  mediaStream: MediaStream | null;
  state: CaptureTrackState;
  track: CaptureTrack;
}) {
  const warning = state.health === "silent" || state.health === "ended";
  const visualizerState = visualizerStateFor(state.health);
  const audioTrack = useLocalAudioTrackFromMediaStream(mediaStream);
  return (
    <div
      className={cn("flex h-9 min-w-0 items-center gap-1.5 rounded-full px-2.5")}
      data-track={track}
      title={`${label} · ${HEALTH_LABEL[state.health]}`}
    >
      <span className="shrink-0 text-xs leading-none">{label}</span>
      <AgentAudioVisualizerBar
        audioTrack={audioTrack}
        barCount={5}
        className={cn(
          "h-4 w-12 shrink-0 gap-0.5 sm:w-14",
          warning ? "text-destructive" : "text-foreground/55",
        )}
        size="icon"
        state={visualizerState}
      />
      <span
        className={cn(
          "hidden shrink-0 text-[10px] leading-none sm:inline",
          warning ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {HEALTH_LABEL[state.health]}
      </span>
    </div>
  );
}

const WORKSPACE_SAVE_COPY: Record<
  WorkspaceSaveState["state"],
  { description: string; title: string }
> = {
  "action-required": {
    description: "本地录音仍然安全，可检查网络或工作区后重试。",
    title: "保存到工作区需要处理",
  },
  uploading: { description: "正在把麦克风与系统音轨直接上传到录音存储。", title: "正在上传" },
  verifying: { description: "服务器正在核对两条源音轨的对象与完整性。", title: "正在验证" },
  "waiting-for-network": {
    description: "本地保存已冻结，正在等待网络和工作区连接。",
    title: "等待网络",
  },
  "workspace-verified": {
    description: "两条源音轨已由服务器验证并保存到工作区。",
    title: "已保存到工作区",
  },
};

function workspaceSaveIcon(state?: WorkspaceSaveState["state"]): string {
  if (state === "workspace-verified") {
    return "ph:check-circle-fill";
  }
  if (state === "action-required") {
    return "ph:warning-circle-fill";
  }
  return "ph:cloud-arrow-up";
}

function localSaveDescription(
  workspaceSave: WorkspaceSaveState | undefined,
  copy: { description: string; title: string } | null,
): string {
  if (workspaceSave?.error) {
    return workspaceSave.error;
  }
  if (workspaceSave?.state === "workspace-verified" && workspaceSave.recoveryCopyDeleteAfter) {
    return `双轨源音频已验证；本地 Recovery Copy 将在 ${formatRecoveryDeadline(workspaceSave.recoveryCopyDeleteAfter)} 后自动清理。`;
  }
  return copy?.description ?? "双轨清单和保存意图已冻结，尚未保存到工作区。";
}

export function MeetingLocalSaveStatus({
  captureId,
  className,
  onDiscard,
  onSave,
  snapshot,
}: {
  captureId: string;
  className?: string;
  onDiscard: (captureId?: string, includeSaved?: boolean) => void;
  onSave: (captureId?: string) => void;
  snapshot: MeetingCaptureSnapshot;
}) {
  const saved = snapshot.saved?.captureId === captureId ? snapshot.saved : null;
  if (!saved) {
    return null;
  }
  const workspaceSave = snapshot.workspaceSaves.find((item) => item.captureId === captureId);
  const copy = workspaceSave ? WORKSPACE_SAVE_COPY[workspaceSave.state] : null;
  const needsRetry = workspaceSave?.state === "action-required";
  return (
    <div className={cn("grid gap-3 rounded-xl border border-border bg-muted/20 p-4", className)}>
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 size-5 text-amber-600",
            workspaceSave?.state === "workspace-verified" && "text-emerald-600",
            needsRetry && "text-destructive",
          )}
          icon={workspaceSaveIcon(workspaceSave?.state)}
        />
        <div>
          <p className="font-semibold text-sm">{copy?.title ?? "录音已安全保存在本地"}</p>
          <p className="text-muted-foreground text-xs">
            {localSaveDescription(workspaceSave, copy)}
          </p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {needsRetry ? (
          <Button onClick={() => onSave(captureId)} size="sm">
            重试保存到工作区
          </Button>
        ) : null}
        <Button onClick={() => onDiscard(captureId, true)} size="sm" variant="ghost">
          清除这份本地保存
        </Button>
      </div>
    </div>
  );
}

const IDLE_TRACK_STATE: CaptureTrackState = { health: "checking", level: 0 };

/**
 * Horizontally scrollable track-meter strip: sides stay fixed, middle scrolls.
 * OverlayScrollbars 不占位；溢出边缘用 scroll-fade-x 渐隐（与 web 一致）。
 */
function ComposerTrackMetersScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollArea
      className="h-9 min-w-0 flex-1 basis-0 overflow-hidden [--scroll-fade-size:1.25rem]"
      orientation="horizontal"
      scrollFade
    >
      <div className="flex h-9 w-max items-center gap-1.5 pr-1">{children}</div>
    </ScrollArea>
  );
}

/**
 * Bottom composer while recording: dual-track visualizers + end actions.
 * 录制中底部 composer：双轨电平 + 结束操作。
 */
export function MeetingCaptureComposer({
  onSave,
  snapshot,
}: {
  onSave: (captureId?: string) => void;
  snapshot: MeetingCaptureSnapshot;
}) {
  const elapsed = useElapsed(snapshot.active?.startedAt);
  const previewStreams = useCapturePreviewStreams();
  const systemSilent = snapshot.active?.tracks.system.health === "silent";
  const captureId = snapshot.active?.captureId;

  useEffect(() => {
    if (!systemSilent || !captureId) {
      return;
    }
    toast.warning("系统音频疑似无声，请检查会议播放与录屏权限", {
      duration: 10_000,
      id: `meeting-system-silent:${captureId}`,
    });
  }, [captureId, systemSilent]);

  if (!snapshot.active) {
    return null;
  }
  const busy = snapshot.phase === "saving" || snapshot.phase === "discarding";

  return (
    <MeetingRecordingComposerFrame>
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 shrink-0 items-center gap-1.5">
            <span className="relative size-2 shrink-0" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />
              <span className="absolute inset-0 rounded-full bg-red-500" />
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums leading-none">
              {elapsed}
            </span>
          </div>
          <ComposerTrackMetersScroll>
            <TrackMeter
              label="麦克风"
              mediaStream={previewStreams.microphone}
              state={snapshot.active.tracks.microphone}
              track="microphone"
            />
            <TrackMeter
              label="系统"
              mediaStream={previewStreams.system}
              state={snapshot.active.tracks.system}
              track="system"
            />
          </ComposerTrackMetersScroll>
          <Button
            className="shrink-0 rounded-full"
            disabled={busy}
            onClick={() => onSave()}
            size="sm"
            variant="destructive"
          >
            <Icon
              className={cn("size-4", snapshot.phase === "saving" && "animate-spin")}
              icon={snapshot.phase === "saving" ? "ph:circle-notch" : "ph:stop-fill"}
            />
            {snapshot.phase === "saving" ? "保存中…" : "结束"}
          </Button>
        </div>
        {snapshot.error ? (
          <p className="truncate px-1 text-[11px] text-destructive">{snapshot.error}</p>
        ) : null}
      </div>
    </MeetingRecordingComposerFrame>
  );
}

/**
 * Bottom composer on the new-meeting page: idle track bars + start.
 * 新建录制页底部 composer：空闲双轨电平 + 开始录制。
 */
export function MeetingSetupComposer({
  disabled,
  error,
  onStart,
  starting,
}: {
  disabled?: boolean;
  error?: string | null;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <MeetingRecordingComposerFrame>
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <ComposerTrackMetersScroll>
            <TrackMeter
              label="麦克风"
              mediaStream={null}
              state={IDLE_TRACK_STATE}
              track="microphone"
            />
            <TrackMeter label="系统" mediaStream={null} state={IDLE_TRACK_STATE} track="system" />
          </ComposerTrackMetersScroll>
          <Button
            className="shrink-0 rounded-full"
            disabled={disabled || starting}
            onClick={onStart}
            type="button"
            size="sm"
          >
            <Icon
              className={cn("size-4", starting && "animate-spin")}
              icon={starting ? "ph:circle-notch" : "ph:record-fill"}
            />
            {starting ? "请求权限…" : "开始"}
          </Button>
        </div>
        {error ? <p className="truncate px-1 text-[11px] text-destructive">{error}</p> : null}
      </div>
    </MeetingRecordingComposerFrame>
  );
}

/**
 * 离开当前录制 session 时的最小全局指示，点击回到该 session。
 * Minimal global indicator when the user leaves the active recording session page.
 */
export function MeetingActiveRecordingIndicator({
  snapshot,
}: {
  snapshot: MeetingCaptureSnapshot;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const elapsed = useElapsed(snapshot.active?.startedAt);
  const activeId = snapshot.active?.captureId;
  if (!activeId) {
    return null;
  }
  if (pathname === `/meetings/${activeId}` || pathname.startsWith(`/meetings/${activeId}/`)) {
    return null;
  }

  return (
    <button
      className="fixed right-5 bottom-5 z-[60] flex items-center gap-2 rounded-full border border-border bg-background/95 px-4 py-2.5 shadow-xl backdrop-blur transition-colors hover:bg-accent"
      onClick={() => void navigate({ params: { meetingId: activeId }, to: "/meetings/$meetingId" })}
      type="button"
    >
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
      </span>
      <span className="font-medium text-sm">录制中</span>
      <span className="font-mono text-muted-foreground text-xs">{elapsed}</span>
    </button>
  );
}
