import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LocalAudioTrack } from "livekit-client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AgentAudioVisualizerBar } from "@/components/agents-ui/agent-audio-visualizer-bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type {
  ActiveMeetingCapture,
  CaptureTrackState,
  MeetingCaptureSnapshot,
  WorkspaceSaveState,
} from "../../../../../preload/meeting-capture";
import { cn } from "@app/shared/utils";
import { observeCapturePreviewStreams } from "@/lib/meeting-capture/capture-preview-streams";
import type { CapturePreviewStreams } from "@/lib/meeting-capture/capture-preview-streams";
import { formatAppDateTime } from "@/lib/client/datetime";

const HEALTH_LABEL = {
  checking: "检测中",
  ended: "已中断",
  healthy: "正常",
  muted: "已静音",
  silent: "疑似无声",
} satisfies Record<CaptureTrackState["health"], string>;

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = hours > 0 ? [hours, minutes, remainingSeconds] : [minutes, remainingSeconds];
  return parts.map((value) => String(value).padStart(2, "0")).join(":");
}

function formatRecoveryDeadline(value: string): string {
  return formatAppDateTime(value);
}

export function useElapsed(active?: ActiveMeetingCapture | null) {
  const [now, setNow] = useState(Date.now());
  const resumedAt = active?.resumedAt;
  useEffect(() => {
    if (!resumedAt) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resumedAt]);
  if (!active) {
    return "00:00";
  }
  const runningMs = resumedAt ? Math.max(0, now - new Date(resumedAt).getTime()) : 0;
  return formatElapsed(active.elapsedMs + runningMs);
}

function useCapturePreviewStreams() {
  const [streams, setStreams] = useState<CapturePreviewStreams>({
    microphone: null,
    system: null,
  });
  useEffect(() => observeCapturePreviewStreams(setStreams), []);
  return streams;
}

function visualizerStateForTracks(
  microphone: CaptureTrackState,
  system: CaptureTrackState,
): "connecting" | "listening" | "speaking" {
  const health = [microphone.health, system.health];
  if (health.every((value) => value === "checking")) {
    return "connecting";
  }
  if (health.some((value) => value === "healthy")) {
    return "speaking";
  }
  return "listening";
}

function meetingWaveformEdgeEnvelope(index: number, count: number): number {
  const distanceFromEdge = Math.min(index, count - 1 - index);
  const taperLength = Math.max(2, Math.ceil(count * 0.3));
  const taperProgress = Math.min(1, distanceFromEdge / Math.max(1, taperLength - 1));
  const smoothProgress = taperProgress ** 2 * (3 - 2 * taperProgress);
  return smoothProgress;
}

export function emphasizeMeetingWaveformBand(band: number, index: number, count: number): number {
  const emphasizedBand = band <= 0 ? 0.1 : 0.03 + band ** 1.15 * 1.35;
  return emphasizedBand * (0.12 + meetingWaveformEdgeEnvelope(index, count) * 0.88);
}

export function meetingWaveformBandOpacity(index: number, count: number): number {
  return 0.3 + meetingWaveformEdgeEnvelope(index, count) * 0.7;
}

export function createCapturePreviewAudioTrack(mediaTrack: MediaStreamTrack): LocalAudioTrack;
export function createCapturePreviewAudioTrack<T extends { stop(): void }>(
  mediaTrack: MediaStreamTrack,
  createTrack: (clonedTrack: MediaStreamTrack) => T,
): T;
export function createCapturePreviewAudioTrack(
  mediaTrack: MediaStreamTrack,
  createTrack?: (clonedTrack: MediaStreamTrack) => { stop(): void },
): { stop(): void } {
  // The visualizer owns only a clone. LocalAudioTrack.stop() always stops its underlying
  // MediaStreamTrack, so wrapping the recording source directly would end capture on route unmount.
  const clonedTrack = mediaTrack.clone();
  return createTrack ? createTrack(clonedTrack) : new LocalAudioTrack(clonedTrack, undefined, true);
}

/** Mix both preview streams for visualization while leaving the source recordings independent. */
function useCombinedPreviewAudioTrack(
  microphoneStream: MediaStream | null,
  systemStream: MediaStream | null,
): LocalAudioTrack | undefined {
  const microphoneTrack = microphoneStream?.getAudioTracks()[0] ?? null;
  const systemTrack = systemStream?.getAudioTracks()[0] ?? null;
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | undefined>();

  useEffect(() => {
    const sourceTracks = [microphoneTrack, systemTrack].filter((track): track is MediaStreamTrack =>
      Boolean(track),
    );
    if (sourceTracks.length === 0) {
      setAudioTrack(undefined);
      return;
    }

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const sourceNodes = sourceTracks.map((track) => {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
      return source;
    });
    const [mixedTrack] = destination.stream.getAudioTracks();
    if (!mixedTrack) {
      void audioContext.close();
      setAudioTrack(undefined);
      return;
    }
    const local = createCapturePreviewAudioTrack(mixedTrack);
    setAudioTrack(local);
    return () => {
      local.stop();
      for (const source of sourceNodes) {
        source.disconnect();
      }
      for (const track of destination.stream.getTracks()) {
        track.stop();
      }
      void audioContext.close();
    };
  }, [microphoneTrack, systemTrack]);

  return audioTrack;
}

function CombinedTrackVisualizer({
  microphoneStream,
  microphoneState,
  paused = false,
  systemStream,
  systemState,
}: {
  microphoneStream: MediaStream | null;
  microphoneState: CaptureTrackState;
  paused?: boolean;
  systemStream: MediaStream | null;
  systemState: CaptureTrackState;
}) {
  const audioTrack = useCombinedPreviewAudioTrack(microphoneStream, systemStream);
  const warning = [microphoneState.health, systemState.health].some(
    (health) => health === "silent" || health === "ended",
  );
  const state = paused ? "listening" : visualizerStateForTracks(microphoneState, systemState);
  return (
    <AgentAudioVisualizerBar
      audioTrack={audioTrack}
      aria-label="麦克风与系统音轨的合并音量"
      bandOpacity={meetingWaveformBandOpacity}
      bandTransform={emphasizeMeetingWaveformBand}
      barCount={80}
      className={cn(
        "h-12 w-full min-w-0 justify-between gap-0 overflow-hidden",
        warning ? "text-destructive" : "text-foreground/55",
      )}
      data-slot="meeting-combined-audio-visualizer"
      size="icon"
      state={state}
      title={`麦克风 · ${HEALTH_LABEL[microphoneState.health]}；系统音轨 · ${HEALTH_LABEL[systemState.health]}`}
      volumeOptions={{
        analyserOptions: { fftSize: 2048, smoothingTimeConstant: 0.25 },
        hiPass: 600,
        loPass: 80,
        updateInterval: 24,
      }}
    >
      <div className="min-h-px w-1 shrink-0 rounded-full bg-current/10 transition-[height,opacity,background-color] duration-[80ms] ease-out motion-reduce:transition-none data-[lk-highlighted=true]:bg-current" />
    </AgentAudioVisualizerBar>
  );
}

const WORKSPACE_SAVE_COPY = {
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
} satisfies Record<WorkspaceSaveState["state"], { description: string; title: string }>;

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
 * Bottom composer while recording: dual-track visualizers + end actions.
 * 录制中底部 composer：双轨电平 + 结束操作。
 */
export function MeetingCaptureComposer({
  onPause,
  onResume,
  onSave,
  snapshot,
}: {
  onPause: () => void;
  onResume: () => void;
  onSave: (captureId?: string) => void;
  snapshot: MeetingCaptureSnapshot;
}) {
  const elapsed = useElapsed(snapshot.active);
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
  const paused = snapshot.phase === "paused";

  return (
    <div className="grid min-w-0 gap-4 px-3 pb-1" data-slot="meeting-recording-composer">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center" data-slot="meeting-composer-waveform-row">
          <CombinedTrackVisualizer
            microphoneStream={previewStreams.microphone}
            microphoneState={snapshot.active.tracks.microphone}
            paused={paused}
            systemStream={previewStreams.system}
            systemState={snapshot.active.tracks.system}
          />
        </div>
        <div
          className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3"
          data-slot="meeting-composer-controls"
        >
          <div
            className="flex h-10 shrink-0 items-center gap-1.5 pl-1"
            data-slot="meeting-recording-status"
          >
            <span className="relative size-1.5 shrink-0" aria-hidden>
              {paused ? null : (
                <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-60" />
              )}
              <span
                className={cn(
                  "absolute inset-0 rounded-full",
                  paused ? "bg-amber-500" : "bg-red-500",
                )}
              />
            </span>
            <span className="font-mono text-sm tabular-nums leading-none">{elapsed}</span>
          </div>
          <Button
            aria-label={paused ? "继续录制" : "暂停录制"}
            className="h-12 w-[4.8rem] rounded-full border-transparent bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary"
            disabled={busy}
            onClick={paused ? onResume : onPause}
            size="icon"
            title={paused ? "继续录制" : "暂停录制"}
            variant="ghost"
          >
            <Icon className="size-5" icon={paused ? "ph:play-fill" : "ph:pause-fill"} />
          </Button>
          <Button
            aria-label="结束并保存录制"
            className="h-10 w-[3.2rem] justify-self-end rounded-full border-transparent bg-muted text-foreground shadow-none hover:bg-muted/80 hover:text-foreground"
            disabled={busy}
            onClick={() => onSave()}
            size="icon"
            title="结束并保存录制"
            variant="ghost"
          >
            <Icon
              className={cn("size-4", snapshot.phase === "saving" && "animate-spin")}
              icon={snapshot.phase === "saving" ? "ph:circle-notch" : "ph:stop-fill"}
            />
          </Button>
        </div>
        {snapshot.error ? (
          <p className="truncate px-1 text-[11px] text-destructive">{snapshot.error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MeetingInterruptedComposer({
  onContinue,
  onSave,
}: {
  onContinue: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-4 px-3 pb-1" data-slot="meeting-interrupted-composer">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center" data-slot="meeting-composer-waveform-row">
          <CombinedTrackVisualizer
            microphoneStream={null}
            microphoneState={IDLE_TRACK_STATE}
            paused
            systemStream={null}
            systemState={IDLE_TRACK_STATE}
          />
        </div>
        <div
          className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3"
          data-slot="meeting-composer-controls"
        >
          <div
            className="flex h-10 min-w-0 items-center gap-1.5 pl-1"
            data-slot="meeting-interrupted-status"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
            <span className="truncate text-muted-foreground text-xs">录制暂停</span>
          </div>
          <Button
            aria-label="继续录制"
            className="h-12 w-[4.8rem] rounded-full border-transparent bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary"
            onClick={onContinue}
            size="icon"
            title="继续录制"
            variant="ghost"
          >
            <Icon className="size-5" icon="ph:play-fill" />
          </Button>
          <Button
            aria-label="结束并保存录制"
            className="h-10 w-[3.2rem] justify-self-end rounded-full border-transparent bg-muted text-foreground shadow-none hover:bg-muted/80 hover:text-foreground"
            onClick={onSave}
            size="icon"
            title="结束并保存录制"
            variant="ghost"
          >
            <Icon className="size-4" icon="ph:stop-fill" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Bottom composer on the new-meeting page: idle combined waveform + centered start.
 * 新建录制页底部 composer：空闲合并波形 + 居中开始按钮。
 */
export function MeetingSetupComposer({
  disabled,
  error,
  onStart,
  starting,
}: {
  disabled?: boolean;
  error?: string | null;
  onStart: (microphoneDeviceId?: string) => void;
  starting: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-4 px-3 pb-1" data-slot="meeting-setup-composer">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 items-center" data-slot="meeting-composer-row">
          <CombinedTrackVisualizer
            microphoneStream={null}
            microphoneState={IDLE_TRACK_STATE}
            systemStream={null}
            systemState={IDLE_TRACK_STATE}
          />
        </div>
        <div className="flex justify-center">
          <Button
            aria-label="开始录制"
            className="h-12 w-[4.8rem] rounded-full border-transparent bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary"
            disabled={disabled || starting}
            onClick={() => onStart()}
            size="icon"
            title="开始录制"
            type="button"
            variant="ghost"
          >
            <Icon
              className={cn("size-5", starting && "animate-spin")}
              icon={starting ? "ph:circle-notch" : "ph:microphone-fill"}
            />
          </Button>
        </div>
        {error ? <p className="truncate px-1 text-[11px] text-destructive">{error}</p> : null}
      </div>
    </div>
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
  const elapsed = useElapsed(snapshot.active);
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
      onClick={() => {
        navigate({ params: { meetingId: activeId }, to: "/meetings/$meetingId" });
      }}
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
