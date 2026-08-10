import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import type {
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftStatus,
} from "@/lib/meeting-capture/live-transcript-draft";
import { cn } from "@arc/shared/utils";

const STATUS_LABEL: Record<Exclude<LiveTranscriptDraftStatus, "idle">, string> = {
  interrupted: "interrupted",
  live: "live",
  reconnecting: "reconnecting",
  starting: "starting",
};

const TRACK_LABEL = {
  microphone: "我的麦克风",
  system: "系统音频",
} as const;

/**
 * Live transcript stage for the meeting session main area.
 * 会议 session 主区的实时字幕舞台。
 */
export function LiveTranscriptDraftPanel({
  snapshot,
  className,
  emptyHint = "等待检测到语音…",
}: {
  snapshot: LiveTranscriptDraftSnapshot;
  className?: string;
  emptyHint?: string;
}) {
  const status = snapshot.status === "idle" ? "starting" : snapshot.status;
  const sections = new Map(snapshot.sections.map((section) => [section.id, section]));
  let previousSectionId: string | null = null;

  return (
    <section className={cn("flex min-h-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p className="font-medium text-sm">实时字幕</p>
          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
            provisional
          </span>
        </div>
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] text-muted-foreground",
            status === "live" && "text-emerald-600 dark:text-emerald-400",
            status === "interrupted" && "text-destructive",
          )}
        >
          <Icon
            className={cn(
              "size-3.5",
              ["starting", "reconnecting"].includes(status) && "animate-spin",
            )}
            icon={status === "live" ? "ph:broadcast-fill" : "ph:circle-notch"}
          />
          {STATUS_LABEL[status]}
        </span>
      </div>
      {snapshot.error ? <p className="text-destructive text-xs">{snapshot.error}</p> : null}
      {snapshot.turns.length > 0 ? (
        <div className="grid flex-1 gap-3 pr-1" aria-live="polite">
          {snapshot.turns.map((turn) => {
            const section = sections.get(turn.sectionId);
            const showSection = turn.sectionId !== previousSectionId;
            previousSectionId = turn.sectionId;
            return (
              <div className="grid gap-1" key={turn.id}>
                {showSection && section ? (
                  <p className="pt-2 text-[11px] text-muted-foreground first:pt-0">
                    草稿区段 {section.sequence + 1} · {TRACK_LABEL[section.track]}
                  </p>
                ) : null}
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    !turn.final && "text-muted-foreground italic",
                  )}
                >
                  {turn.text}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-4 py-16">
          <p className="text-center text-muted-foreground text-sm">{emptyHint}</p>
        </div>
      )}
      {snapshot.droppedPcmFrames > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          已跳过 {snapshot.droppedPcmFrames} 个实时 PCM frame；本地录音未受影响。
        </p>
      ) : null}
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
    <section className={cn("flex min-h-full flex-col gap-6", className)}>
      {children}
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-muted-foreground text-sm">实时字幕</p>
      </div>
    </section>
  );
}
