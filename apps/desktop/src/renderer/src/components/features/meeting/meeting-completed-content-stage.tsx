import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import { Icon } from "@/components/ui/icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MeetingLiveSummaryControllerSnapshot } from "@/lib/meeting-capture/live-summary-controller";
import { MeetingLiveSummaryDocument } from "./meeting-live-summary-document";
import { MeetingLiveSummaryPanel } from "./meeting-live-summary-panel";

type CompletedContentView = "document" | "mind-map" | "transcript";

const noDragStyle: CSSProperties & { WebkitAppRegion: "no-drag" } = {
  WebkitAppRegion: "no-drag",
};

function controllerSnapshot(
  summary: MeetingLiveSummarySnapshot | null,
): MeetingLiveSummaryControllerSnapshot {
  return {
    captureId: summary?.captureId ?? null,
    error: null,
    pendingCharacters: 0,
    status: summary ? "ready" : "idle",
    summary,
  };
}

export function MeetingCompletedContentStage({
  summary,
  transcript,
}: {
  summary: MeetingLiveSummarySnapshot | null;
  transcript: ReactNode;
}) {
  const [selectedView, setSelectedView] = useState<CompletedContentView | null>(null);
  const view = selectedView ?? (summary ? "document" : "transcript");
  const snapshot = controllerSnapshot(summary);
  const showTranscriptEvidence = () => setSelectedView("transcript");

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-10 sm:px-6">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3">
        <h2 className="font-semibold text-sm">会议内容</h2>
        <TooltipProvider delay={200}>
          <ToggleGroup
            aria-label="会议内容显示方式"
            className="app-no-drag"
            onValueChange={(value) => {
              const [next] = value;
              if (next === "document" || next === "mind-map" || next === "transcript") {
                setSelectedView(next);
              }
            }}
            size="sm"
            style={noDragStyle}
            value={[view]}
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem aria-label="Markdown 总结" disabled={!summary} value="document">
                    <Icon aria-hidden icon="ph:list-bullets" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>Markdown 总结</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem aria-label="思维导图" disabled={!summary} value="mind-map">
                    <Icon aria-hidden icon="ph:tree-structure" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>思维导图</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToggleGroupItem aria-label="实时字幕" value="transcript">
                    <Icon aria-hidden icon="ph:subtitles" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent>实时字幕</TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      </header>
      <div className="min-h-0 flex-1">
        {view === "document" ? (
          <MeetingLiveSummaryDocument onEvidence={showTranscriptEvidence} snapshot={snapshot} />
        ) : null}
        {view === "mind-map" ? (
          <div className="h-[min(42rem,70vh)] min-h-[32rem]">
            <MeetingLiveSummaryPanel onEvidence={showTranscriptEvidence} snapshot={snapshot} />
          </div>
        ) : null}
        {view === "transcript" ? transcript : null}
      </div>
    </section>
  );
}
