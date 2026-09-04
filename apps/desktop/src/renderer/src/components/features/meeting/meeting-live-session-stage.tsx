import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { LiveTranscriptDraftSnapshot } from "@/lib/meeting-capture/live-transcript-draft";
import type { MeetingLiveSummaryControllerSnapshot } from "@/lib/meeting-capture/live-summary-controller";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";
import { MeetingLiveSummaryDocument } from "./meeting-live-summary-document";
import { MeetingLiveSummaryPanel } from "./meeting-live-summary-panel";

type SummaryView = "document" | "mind-map";

interface ElectronNoDragStyle extends CSSProperties {
  WebkitAppRegion: "no-drag";
  appRegion: "no-drag";
}

const noDragStyle: ElectronNoDragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
};

function summaryStatus(snapshot: MeetingLiveSummaryControllerSnapshot): string | null {
  if (snapshot.status === "updating") {
    return "更新中";
  }
  if (snapshot.status === "degraded") {
    return "等待重试";
  }
  return snapshot.summary ? `已更新 ${snapshot.summary.revision} 次` : null;
}

export function MeetingLiveSessionStage({
  composer,
  header,
  summary,
  transcript,
}: {
  composer: ReactNode;
  header: ReactNode;
  summary: MeetingLiveSummaryControllerSnapshot;
  transcript: LiveTranscriptDraftSnapshot;
}) {
  const [summaryView, setSummaryView] = useState<SummaryView>("mind-map");
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);

  const showEvidence = (turnId: string) => {
    setHighlightedTurnId(turnId);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-live-transcript-turn="${CSS.escape(turnId)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <ResizablePanelGroup className="h-dvh min-h-[36rem] overflow-hidden" orientation="horizontal">
      <ResizablePanel defaultSize="42%" minSize="320px">
        <section className="flex h-full min-w-0 flex-col overflow-hidden">
          <div
            className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-3 sm:px-6"
            style={{ paddingTop: TITLE_BAR_HEIGHT_PX + 16 }}
          >
            {header}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <LiveTranscriptDraftPanel highlightedTurnId={highlightedTurnId} snapshot={transcript} />
          </div>
          <div className="shrink-0 bg-background px-4 pt-2 pb-5 sm:px-6">
            <div className="mx-auto w-full max-w-2xl">{composer}</div>
          </div>
        </section>
      </ResizablePanel>
      <ResizableHandle aria-label="调整实时字幕和实时总结宽度" />
      <ResizablePanel defaultSize="58%" minSize="400px">
        <section className="flex h-full min-w-0 flex-col overflow-hidden bg-sidebar/70">
          <header className="flex h-10 shrink-0 items-center justify-between gap-3 pl-5 pr-[calc(var(--desktop-chrome-right-controls-width,2.25rem)+1.25rem)]">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="font-semibold text-sm">实时总结</h2>
              <span aria-live="polite" className="text-muted-foreground text-[11px]">
                {summaryStatus(summary)}
              </span>
            </div>
            <TooltipProvider delay={200}>
              <ToggleGroup
                aria-label="实时总结显示方式"
                className="app-no-drag relative"
                onDoubleClick={(event) => event.stopPropagation()}
                onValueChange={(value) => {
                  const [next] = value;
                  if (next === "document" || next === "mind-map") {
                    setSummaryView(next);
                  }
                }}
                size="sm"
                style={noDragStyle}
                value={[summaryView]}
              >
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem aria-label="思维导图形式" value="mind-map">
                        <Icon aria-hidden icon="ph:tree-structure" />
                      </ToggleGroupItem>
                    }
                  />
                  <TooltipContent>思维导图形式</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem aria-label="文档形式" value="document">
                        <Icon aria-hidden icon="ph:list-bullets" />
                      </ToggleGroupItem>
                    }
                  />
                  <TooltipContent>文档形式</TooltipContent>
                </Tooltip>
              </ToggleGroup>
            </TooltipProvider>
          </header>
          {summary.status === "degraded" ? (
            <Alert className="mx-5 mt-3 w-auto" variant="warning">
              <AlertDescription>
                {summary.error ?? "AI 实时总结暂时不可用"}。录音和实时字幕不受影响，将自动重试。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="min-h-0 flex-1">
            {summaryView === "mind-map" ? (
              <MeetingLiveSummaryPanel onEvidence={showEvidence} snapshot={summary} />
            ) : (
              <MeetingLiveSummaryDocument onEvidence={showEvidence} snapshot={summary} />
            )}
          </div>
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
