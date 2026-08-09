import { Icon } from "@/components/ui/icon";
import type {
  LiveTranscriptDraftSnapshot,
  LiveTranscriptDraftStatus,
} from "@/lib/meeting-capture/live-transcript-draft";
import { cn } from "@arc/shared/utils";

const STATUS_COPY: Record<
  Exclude<LiveTranscriptDraftStatus, "idle">,
  { description: string; label: string }
> = {
  interrupted: {
    description: "实时字幕已中断，录音仍在继续",
    label: "interrupted",
  },
  live: { description: "正在生成临时字幕", label: "live" },
  reconnecting: {
    description: "正在建立新的草稿区段，录音仍在继续",
    label: "reconnecting",
  },
  starting: { description: "正在连接实时字幕 provider", label: "starting" },
};

const TRACK_LABEL = {
  microphone: "我的麦克风",
  system: "系统音频",
} as const;

export function LiveTranscriptDraftPanel({ snapshot }: { snapshot: LiveTranscriptDraftSnapshot }) {
  const status = snapshot.status === "idle" ? "starting" : snapshot.status;
  const copy = STATUS_COPY[status];
  const sections = new Map(snapshot.sections.map((section) => [section.id, section]));
  let previousSectionId: string | null = null;

  return (
    <section className="grid gap-2 rounded-lg border border-border bg-muted/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-xs">Live Transcript Draft</p>
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
              provisional
            </span>
          </div>
          <p className="text-muted-foreground text-[11px]">临时草稿可能变化，不是最终会议记录。</p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] text-muted-foreground",
            status === "live" && "text-emerald-600 dark:text-emerald-400",
            status === "interrupted" && "text-destructive",
          )}
        >
          <Icon
            className={cn(
              "size-3",
              ["starting", "reconnecting"].includes(status) && "animate-spin",
            )}
            icon={status === "live" ? "ph:broadcast-fill" : "ph:circle-notch"}
          />
          {copy.label}
        </span>
      </div>
      <p className="text-muted-foreground text-[11px]">{snapshot.error ?? copy.description}</p>
      {snapshot.turns.length > 0 ? (
        <div className="grid max-h-48 gap-2 overflow-y-auto pr-1" aria-live="polite">
          {snapshot.turns.map((turn) => {
            const section = sections.get(turn.sectionId);
            const showSection = turn.sectionId !== previousSectionId;
            previousSectionId = turn.sectionId;
            return (
              <div className="grid gap-1" key={turn.id}>
                {showSection && section ? (
                  <p className="border-border border-t pt-1.5 text-[10px] text-muted-foreground first:border-t-0 first:pt-0">
                    草稿区段 {section.sequence + 1} · {TRACK_LABEL[section.track]}
                  </p>
                ) : null}
                <p className={cn("text-xs", !turn.final && "text-muted-foreground italic")}>
                  {turn.text}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md bg-background/70 px-2 py-2 text-muted-foreground text-xs">
          等待检测到语音…
        </p>
      )}
      {snapshot.droppedPcmFrames > 0 ? (
        <p className="text-[10px] text-muted-foreground">
          为保持内存有界，已跳过 {snapshot.droppedPcmFrames} 个实时 PCM frame；本地录音未受影响。
        </p>
      ) : null}
    </section>
  );
}
