import { cn } from "@app/shared/utils";
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
  children,
}: {
  summary: MeetingLiveSummarySnapshot | null;
  transcript: ReactNode;
  children: (slots: { toolbar: ReactNode; content: ReactNode; scrollable: boolean }) => ReactNode;
}) {
  const [selectedView, setSelectedView] = useState<CompletedContentView | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const view = selectedView ?? (summary ? "document" : "transcript");
  const snapshot = controllerSnapshot(summary);
  const showTranscriptEvidence = () => setSelectedView("transcript");

  return children({
    content: (
      <section
        className={cn(
          "flex w-full flex-col",
          view === "mind-map" ? "h-full min-h-0" : "min-h-full pb-10",
        )}
        data-slot="meeting-completed-content-stage"
      >
        <div className="min-h-0 flex-1">
          {view === "document" ? (
            <MeetingLiveSummaryDocument
              highlightedNodeId={highlightedNodeId}
              onEvidence={showTranscriptEvidence}
              snapshot={snapshot}
            />
          ) : null}
          {view === "mind-map" ? (
            <div className="h-full min-h-0 w-full" data-slot="meeting-completed-mind-map">
              <MeetingLiveSummaryPanel
                onEvidence={showTranscriptEvidence}
                onNodeSelect={(nodeId) => {
                  setHighlightedNodeId(nodeId);
                  setSelectedView("document");
                }}
                snapshot={snapshot}
              />
            </div>
          ) : null}
          {view === "transcript" ? (
            <div
              className="mx-auto w-full max-w-3xl px-4 sm:px-6"
              data-slot="meeting-completed-transcript"
            >
              {transcript}
            </div>
          ) : null}
        </div>
      </section>
    ),
    scrollable: view !== "mind-map",
    toolbar: (
      <header
        className="mx-auto flex h-11 w-full max-w-3xl shrink-0 items-center justify-start px-4 sm:px-6"
        data-slot="meeting-completed-content-header"
      >
        <TooltipProvider delay={200}>
          <ToggleGroup
            aria-label="会议内容显示方式"
            className="app-no-drag"
            onValueChange={(value) => {
              const [next] = value;
              if (next === "document" || next === "mind-map" || next === "transcript") {
                setHighlightedNodeId(null);
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
    ),
  });
}
