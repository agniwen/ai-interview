import { useCallback } from "react";
import type { MeetingLiveSummaryControllerSnapshot } from "@/lib/meeting-capture/live-summary-controller";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MeetingLiveSummaryEmpty } from "./meeting-live-summary-panel";

function firstEvidence(ids: string[]): string {
  const [first] = ids;
  if (!first) {
    throw new Error("实时总结节点缺少字幕证据");
  }
  return first;
}

export function MeetingLiveSummaryDocument({
  highlightedNodeId,
  onEvidence,
  snapshot,
}: {
  highlightedNodeId?: string | null;
  onEvidence: (turnId: string) => void;
  snapshot: MeetingLiveSummaryControllerSnapshot;
}) {
  const scrollToHighlight = useCallback((element: HTMLElement | null) => {
    element?.scrollIntoView({ behavior: "instant", block: "center" });
  }, []);
  const highlightProps = (nodeId: string) => ({
    "data-highlighted": highlightedNodeId === nodeId || undefined,
    "data-summary-node-id": nodeId,
    ref: highlightedNodeId === nodeId ? scrollToHighlight : undefined,
  });

  if (!snapshot.summary) {
    return <MeetingLiveSummaryEmpty status={snapshot.status} />;
  }

  return (
    <ScrollArea className="h-full min-h-0" orientation="vertical" scrollFade>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 select-text sm:px-6">
        <p
          {...highlightProps("meeting-live-summary-root")}
          className="rounded-md text-sm leading-7 data-[highlighted=true]:bg-primary/10 data-[highlighted=true]:ring-4 data-[highlighted=true]:ring-primary/10"
        >
          {snapshot.summary.summary}
        </p>
        <ul className="flex flex-col gap-5">
          {snapshot.summary.topics.map((topic) => (
            <li
              {...highlightProps(topic.id)}
              className="flex gap-3 rounded-md data-[highlighted=true]:bg-primary/10 data-[highlighted=true]:ring-4 data-[highlighted=true]:ring-primary/10"
              key={topic.id}
            >
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
              <div className="min-w-0 flex-1">
                <Button
                  className="h-auto justify-start whitespace-normal px-0 py-0 text-left font-semibold leading-6"
                  onClick={() => onEvidence(firstEvidence(topic.evidenceTurnIds))}
                  type="button"
                  variant="text"
                >
                  {topic.title}
                </Button>
                <p className="mt-1 text-muted-foreground text-sm leading-6">{topic.summary}</p>
                {topic.points.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {topic.points.map((point) => (
                      <li
                        {...highlightProps(point.id)}
                        className="flex items-start gap-2 rounded-md pl-1 data-[highlighted=true]:bg-primary/10 data-[highlighted=true]:ring-4 data-[highlighted=true]:ring-primary/10"
                        key={point.id}
                      >
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                        <Button
                          className="h-auto w-full justify-start whitespace-normal px-0 py-0 text-left font-normal leading-6"
                          onClick={() => onEvidence(firstEvidence(point.evidenceTurnIds))}
                          type="button"
                          variant="text"
                        >
                          {point.text}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </article>
    </ScrollArea>
  );
}
