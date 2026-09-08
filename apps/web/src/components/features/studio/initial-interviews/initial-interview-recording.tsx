import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconList, IconSitemap, IconSubtitles } from "@tabler/icons-react";
import { initialInterviewKeys } from "@app/shared/human-initial-interview";
import type { HumanInitialInterviewDetail } from "@app/shared/human-initial-interview";
import { getInitialInterview } from "@/lib/client/initial-interviews";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createMeetingSpeakerProfiles, MeetingSpeakerLabel } from "./initial-interview-speaker";
import { MeetingLiveSummaryDocument } from "./initial-interview-summary-document";

const MindMap = lazy(async () => {
  const mindMap = await import("./initial-interview-mind-map");
  return { default: mindMap.MeetingLiveSummaryPanel };
});
type View = "document" | "mind-map" | "transcript";
const VIEW_LABELS = {
  document: "Markdown 总结",
  "mind-map": "思维导图",
  transcript: "实时字幕",
} satisfies Record<View, string>;

export function InitialInterviewRecordingContent({
  detail,
}: {
  detail: HumanInitialInterviewDetail;
}) {
  const summary = detail.snapshot.liveSummary ?? null;
  const turns = detail.versions[0]?.turns ?? detail.snapshot.turns;
  const speakers = useMemo(
    () => createMeetingSpeakerProfiles(turns, detail.id),
    [turns, detail.id],
  );
  const [selectedView, setSelectedView] = useState<View | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);
  const view = selectedView ?? (summary ? "document" : "transcript");
  const snapshot = { status: summary ? ("ready" as const) : ("idle" as const), summary };
  const showEvidence = (turnId: string) => {
    // Offline transcription may replace live turn IDs; the topic time still locates its passage.
    const topic = summary?.topics.find((item) => item.evidenceTurnIds.includes(turnId));
    const matchingTurn =
      turns.find((turn) => turn.id === turnId) ??
      (topic ? turns.find((turn) => turn.endMs >= topic.startMs) : undefined);
    setHighlightedTurnId(matchingTurn?.id ?? null);
    setSelectedView("transcript");
  };
  return (
    <Frame className="min-w-0" aria-label="人工沟通内容">
      <FrameHeader className="h-auto min-h-8 flex-wrap justify-between gap-2 py-1">
        <FrameTitle>{VIEW_LABELS[view]}</FrameTitle>
        <ToggleGroup
          aria-label="沟通内容显示方式"
          size="sm"
          value={[view]}
          onValueChange={(values) => {
            const [next] = values;
            if (next === "document" || next === "mind-map" || next === "transcript") {
              setSelectedView(next);
              setHighlightedNodeId(null);
              setHighlightedTurnId(null);
            }
          }}
        >
          <ToggleGroupItem
            aria-label="Markdown 总结"
            title="Markdown 总结"
            value="document"
            disabled={!summary}
          >
            <IconList className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="思维导图"
            title="思维导图"
            value="mind-map"
            disabled={!summary}
          >
            <IconSitemap className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem aria-label="实时字幕" title="实时字幕" value="transcript">
            <IconSubtitles className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </FrameHeader>
      <FramePanel
        className="h-[clamp(20rem,60dvh,56rem)] min-w-0 overflow-hidden p-0"
        data-testid="initial-interview-content"
      >
        {view === "document" ? (
          <MeetingLiveSummaryDocument
            snapshot={snapshot}
            highlightedNodeId={highlightedNodeId}
            onEvidence={showEvidence}
          />
        ) : null}
        {view === "mind-map" ? (
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <MindMap
              snapshot={snapshot}
              onEvidence={showEvidence}
              onNodeSelect={(id) => {
                setHighlightedNodeId(id);
                setSelectedView("document");
              }}
            />
          </Suspense>
        ) : null}
        {view === "transcript" ? (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
              {turns.map((turn) => (
                <div
                  key={turn.id}
                  data-highlighted={highlightedTurnId === turn.id || undefined}
                  ref={
                    highlightedTurnId === turn.id
                      ? (element) => {
                          element?.scrollIntoView({ behavior: "instant", block: "center" });
                        }
                      : undefined
                  }
                  className="rounded-md data-[highlighted=true]:bg-primary/10 data-[highlighted=true]:ring-4 data-[highlighted=true]:ring-primary/10"
                >
                  <div className="mb-1.5 flex gap-3 text-xs text-muted-foreground">
                    <MeetingSpeakerLabel profile={speakers.get(turn.speakerKey)} />
                    <span>
                      {Math.floor(turn.startMs / 60_000)}:
                      {String(Math.floor(turn.startMs / 1000) % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-7">{turn.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function InitialInterviewRecording({
  slug,
  recordId,
  snapshotId,
}: {
  slug: string;
  recordId: string;
  snapshotId: string;
}) {
  const query = useQuery({
    queryFn: () => getInitialInterview(slug, recordId, snapshotId),
    queryKey: initialInterviewKeys.detail(slug, recordId, snapshotId),
  });
  if (query.isPending) {
    return <Skeleton className="h-80 w-full" />;
  }
  if (query.error) {
    return (
      <div role="alert" className="flex items-center gap-3">
        <p className="text-sm text-destructive">{query.error.message}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void query.refetch();
          }}
        >
          重试
        </Button>
      </div>
    );
  }
  return <InitialInterviewRecordingContent detail={query.data} />;
}
