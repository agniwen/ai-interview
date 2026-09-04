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
  onEvidence,
  snapshot,
}: {
  onEvidence: (turnId: string) => void;
  snapshot: MeetingLiveSummaryControllerSnapshot;
}) {
  if (!snapshot.summary) {
    return <MeetingLiveSummaryEmpty status={snapshot.status} />;
  }

  return (
    <ScrollArea className="h-full min-h-0" orientation="vertical" scrollFade>
      <article className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-5 select-text">
        <p className="text-sm leading-7">{snapshot.summary.summary}</p>
        <ul className="flex flex-col gap-5">
          {snapshot.summary.topics.map((topic) => (
            <li className="flex gap-3" key={topic.id}>
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
                      <li className="flex items-start gap-2 pl-1" key={point.id}>
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
