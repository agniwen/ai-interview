import { useEffect, useId, useLayoutEffect, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftStatus,
  LiveTranscriptDraftTurn,
} from "@/lib/meeting-capture/live-transcript-draft";
import { cn } from "@app/shared/utils";
import { playTranscriptCorrectionSweep } from "./live-transcript-correction-sweep";
import { MeetingSpeakerLabel } from "./meeting-speaker";

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

function TranscriptTurn({
  turn,
  playCorrectionSweep,
}: {
  turn: LiveTranscriptDraftTurn;
  playCorrectionSweep: typeof playTranscriptCorrectionSweep;
}) {
  const blockRef = useRef<HTMLElement>(null);
  const gradientId = useId();
  // Already-corrected history must not replay when the panel mounts again.
  const correctionSeen = useRef(Boolean(turn.correctionModel));
  useEffect(() => {
    if (correctionSeen.current || !turn.correctionModel) {
      return;
    }
    correctionSeen.current = true;
    if (!blockRef.current || !turn.originalText) {
      return;
    }
    return playCorrectionSweep(blockRef.current);
  }, [playCorrectionSweep, turn.correctionModel, turn.originalText, turn.text]);

  return (
    <article
      className={cn(
        "relative isolate grid w-full cursor-text gap-1 px-px py-1 text-left select-text",
        !turn.final && "text-muted-foreground italic",
      )}
      data-live-transcript-turn={turn.id}
      ref={blockRef}
    >
      <MeetingSpeakerLabel className="not-italic" />
      <div className="flex items-start gap-2 text-sm leading-relaxed">
        {turn.correcting ? (
          <output
            aria-label="AI 正在校正"
            className="flex h-lh w-4 shrink-0 select-none items-center justify-center motion-safe:animate-pulse"
            title="AI 正在校正"
          >
            <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
              <defs>
                <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#00b8ff" />
                  <stop offset="45%" stopColor="#8955ff" />
                  <stop offset="75%" stopColor="#ef62c9" />
                  <stop offset="100%" stopColor="#ffb55e" />
                </linearGradient>
              </defs>
              <path
                d="M10 2 12.7 9.3 20 12 12.7 14.7 10 22 7.3 14.7 0 12 7.3 9.3ZM20 1 21.1 3.9 24 5 21.1 6.1 20 9 18.9 6.1 16 5 18.9 3.9Z"
                fill={`url(#${gradientId})`}
              />
            </svg>
          </output>
        ) : null}
        <span className="min-w-0 flex-1">{turn.text}</span>
      </div>
    </article>
  );
}

export function LiveTranscriptScrollContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("container mx-auto max-w-3xl px-4 pb-20 sm:px-6", className)}
      data-slot="live-transcript-scroll-content"
      {...props}
    />
  );
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
  header,
  playCorrectionSweep = playTranscriptCorrectionSweep,
}: {
  snapshot: LiveTranscriptDraftSnapshot;
  className?: string;
  embedded?: boolean;
  emptyHint?: string;
  header?: ReactNode;
  playCorrectionSweep?: typeof playTranscriptCorrectionSweep;
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
          <TranscriptTurn key={turn.id} playCorrectionSweep={playCorrectionSweep} turn={turn} />
        ))}
        {droppedWarning}
      </div>
    );
  }

  return (
    <section className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="container mx-auto grid max-w-3xl gap-3 px-4 sm:px-6">
        {header}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
              录制草稿
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
          <LiveTranscriptScrollContent className="grid select-text" aria-live="polite">
            {snapshot.turns.map((turn) => (
              <TranscriptTurn key={turn.id} playCorrectionSweep={playCorrectionSweep} turn={turn} />
            ))}
            {droppedWarning}
          </LiveTranscriptScrollContent>
        ) : (
          <LiveTranscriptScrollContent className="flex min-h-full flex-col">
            <div className="flex flex-1 items-center justify-center py-16">
              <p className="text-center text-muted-foreground text-sm">{emptyHint}</p>
            </div>
            {droppedWarning}
          </LiveTranscriptScrollContent>
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
