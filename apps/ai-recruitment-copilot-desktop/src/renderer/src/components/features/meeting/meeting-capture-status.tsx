import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type {
  CaptureTrackState,
  MeetingCaptureSnapshot,
  RecoverableMeetingCapture,
} from "../../../../../preload/meeting-capture";
import { cn } from "@arc/shared/utils";

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

function useElapsed(startedAt?: string) {
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

function TrackMeter({ label, state }: { label: string; state: CaptureTrackState }) {
  const warning = state.health === "silent" || state.health === "ended";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("text-muted-foreground", warning && "text-destructive")}>
          {HEALTH_LABEL[state.health]}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-emerald-500 transition-[width]",
            warning && "bg-destructive",
          )}
          style={{ width: `${Math.max(2, Math.min(100, state.level * 350))}%` }}
        />
      </div>
    </div>
  );
}

function RecoveryRow({
  capture,
  onDiscard,
  onSave,
}: {
  capture: RecoverableMeetingCapture;
  onDiscard: (captureId: string, includeSaved: boolean) => void;
  onSave: (captureId: string) => void;
}) {
  const fragments = capture.tracks.microphone.fragmentCount + capture.tracks.system.fragmentCount;
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <p className="font-medium text-sm">
          {capture.status === "interrupted" ? "发现中断的本地录音" : "发现待处理的本地保存"}
        </p>
        <p className="text-muted-foreground text-xs">
          已校验 {fragments} 个连续分片
          {capture.possibleTailGap ? "，结尾可能有未落盘缺口" : ""}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => onDiscard(capture.captureId, capture.status === "saved-local")}
          size="sm"
          variant="ghost"
        >
          放弃
        </Button>
        <Button onClick={() => onSave(capture.captureId)} size="sm">
          保存恢复录音
        </Button>
      </div>
    </div>
  );
}

export function MeetingCaptureStatus({
  onDiscard,
  onSave,
  snapshot,
}: {
  onDiscard: (captureId?: string, includeSaved?: boolean) => void;
  onSave: (captureId?: string) => void;
  snapshot: MeetingCaptureSnapshot;
}) {
  const elapsed = useElapsed(snapshot.active?.startedAt);
  if (!(snapshot.active || snapshot.saved || snapshot.recoverable.length > 0)) {
    return null;
  }
  const busy = snapshot.phase === "saving" || snapshot.phase === "discarding";

  return (
    <aside className="fixed right-5 bottom-5 z-[60] grid w-[min(22rem,calc(100vw-2.5rem))] gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur">
      {snapshot.active ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-red-500" />
              </span>
              <div>
                <p className="font-semibold text-sm">
                  {snapshot.phase === "saving" ? "正在保存本地录音" : "会议录制中"}
                </p>
                <p className="font-mono text-muted-foreground text-xs">{elapsed}</p>
              </div>
            </div>
            <Icon className="size-5 text-muted-foreground" icon="ph:waveform" />
          </div>
          <div className="grid gap-2.5">
            <TrackMeter label="我的麦克风" state={snapshot.active.tracks.microphone} />
            <TrackMeter label="系统音频" state={snapshot.active.tracks.system} />
          </div>
          {snapshot.active.tracks.system.health === "silent" ? (
            <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-destructive text-xs">
              系统音频持续无有效电平。请先确认会议正在播放声音，再检查 macOS
              录屏与系统音频权限、耳机或输出路由；检测到声音后警告会自动清除。
            </p>
          ) : null}
          {snapshot.error ? (
            <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-destructive text-xs">
              {snapshot.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => onDiscard()} size="sm" variant="outline">
              结束并放弃
            </Button>
            <Button disabled={busy} onClick={() => onSave()} size="sm">
              {snapshot.phase === "saving" ? "保存中…" : "结束并保存"}
            </Button>
          </div>
        </>
      ) : null}

      {!snapshot.active && snapshot.saved ? (
        <div className="grid gap-3">
          <div className="flex items-start gap-2">
            <Icon className="mt-0.5 size-5 text-emerald-600" icon="ph:check-circle-fill" />
            <div>
              <p className="font-semibold text-sm">录音已安全保存在本地</p>
              <p className="text-muted-foreground text-xs">
                双轨清单和保存意图已冻结；本步骤未连接服务器，也未上传录音。
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => onDiscard(snapshot.saved?.captureId, true)}
              size="sm"
              variant="ghost"
            >
              清除这份本地保存
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.active
        ? null
        : snapshot.recoverable.map((capture) => (
            <RecoveryRow
              capture={capture}
              key={capture.captureId}
              onDiscard={onDiscard}
              onSave={onSave}
            />
          ))}
    </aside>
  );
}
