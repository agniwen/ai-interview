import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftStatus,
} from "@/lib/meeting-capture/live-transcript-draft";
import { cn } from "@arc/shared/utils";

const STATUS_LABEL = {
  buffering: "延迟",
  degraded: "已降级",
  interrupted: "已中断",
  reconnecting: "重连中",
  starting: "启动中",
} satisfies Record<Exclude<LiveTranscriptDraftStatus, "idle" | "live">, string>;

const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 80;

export function shouldFollowLiveTranscript(viewport: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}): boolean {
  return (
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
    AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
  );
}

function statusIcon(status: Exclude<LiveTranscriptDraftStatus, "idle">): string {
  if (status === "live") {
    return "ph:broadcast-fill";
  }
  if (["buffering", "degraded"].includes(status)) {
    return "ph:warning-circle-fill";
  }
  return "ph:circle-notch";
}

/**
 * Live transcript stage for the meeting session main area.
 * 会议 session 主区的实时字幕舞台。
 */
export function LiveTranscriptDraftPanel({
  snapshot,
  className,
  embedded = false,
  emptyHint = "等待检测到语音…",
}: {
  snapshot: LiveTranscriptDraftSnapshot;
  className?: string;
  embedded?: boolean;
  emptyHint?: string;
}) {
  const { status } = snapshot;
  const viewportRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && shouldFollowRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [snapshot.turns]);

  const droppedWarning =
    snapshot.droppedPcmFrames > 0 ? (
      <p className="text-[11px] text-muted-foreground">
        本段实时字幕可能遗漏约 {Math.round(snapshot.droppedAudioMs)} ms；本地录音未受影响。
      </p>
    ) : null;

  if (embedded) {
    if (snapshot.turns.length === 0) {
      return (
        <div className={cn("flex flex-col gap-3", className)}>
          {snapshot.error ? (
            <p
              className={cn(
                "text-xs",
                status === "degraded" ? "text-amber-700 dark:text-amber-300" : "text-destructive",
              )}
            >
              {snapshot.error}
            </p>
          ) : null}
          <p className="text-center text-muted-foreground text-sm">{emptyHint}</p>
          {droppedWarning}
        </div>
      );
    }
    return (
      <div aria-live="polite" className={cn("grid select-text", className)}>
        {snapshot.turns.map((turn) => (
          <p
            className={cn(
              "cursor-text! rounded-sm p-1 text-sm leading-relaxed hover:bg-foreground/4",
              !turn.final && "text-muted-foreground italic",
            )}
            key={turn.id}
          >
            {turn.text}
          </p>
        ))}
        {droppedWarning}
      </div>
    );
  }

  return (
    <section className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="container mx-auto grid max-w-3xl gap-3 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
              草稿
            </span>
          </div>
          {status === "idle" ? null : (
            <span
              aria-label={
                status === "live" ? "实时字幕状态：实时" : `实时字幕状态：${STATUS_LABEL[status]}`
              }
              className={cn(
                "flex items-center gap-1 text-[11px] text-muted-foreground",
                status === "live" && "text-emerald-600 dark:text-emerald-400",
                ["buffering", "degraded"].includes(status) && "text-amber-600 dark:text-amber-400",
                status === "interrupted" && "text-destructive",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-3.5",
                  ["starting", "reconnecting"].includes(status) && "animate-spin",
                )}
                icon={statusIcon(status)}
              />
              {status === "live" ? null : STATUS_LABEL[status]}
            </span>
          )}
        </div>
        {snapshot.error ? (
          <p
            className={cn(
              "text-xs",
              status === "degraded" ? "text-amber-700 dark:text-amber-300" : "text-destructive",
            )}
          >
            {snapshot.error}
          </p>
        ) : null}
        {status === "buffering" ? (
          <p className="text-amber-600 text-xs dark:text-amber-400">
            字幕延迟约 {(snapshot.queuedAudioMs / 1000).toFixed(1)} 秒，正在追赶…
          </p>
        ) : null}
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        orientation="vertical"
        scrollFade
        scrollbars="leave"
        viewportProps={{
          onScroll: (event) => {
            shouldFollowRef.current = shouldFollowLiveTranscript(event.currentTarget);
          },
        }}
        viewportRef={viewportRef}
      >
        {snapshot.turns.length > 0 ? (
          <div
            className="container mx-auto grid max-w-3xl select-text px-4 pb-20 sm:px-6"
            aria-live="polite"
          >
            {snapshot.turns.map((turn) => (
              <p
                className={cn(
                  "cursor-text! rounded-sm p-1 text-sm leading-relaxed hover:bg-foreground/4",
                  !turn.final && "text-muted-foreground italic",
                )}
                key={turn.id}
              >
                {turn.text}
              </p>
            ))}
            {droppedWarning}
          </div>
        ) : (
          <div className="container mx-auto flex min-h-full max-w-3xl flex-col px-4 pb-20 sm:px-6">
            <div className="flex flex-1 items-center justify-center py-16">
              <p className="text-center text-muted-foreground text-sm">{emptyHint}</p>
            </div>
            {droppedWarning}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}

/**
 * Pre-start placeholder for the new-meeting page main stage.
 * 新建录制页主区：尚未开始时的字幕占位。
 */
export function MeetingTranscriptIdleStage({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "container mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-4 pb-20 sm:px-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
