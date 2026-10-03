import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LocalDateTimeText } from "@/components/features/display/local-date-time-text";

export interface EvaluationTimelineEntry {
  id: string;
  title: string;
  timestamp?: string | null;
  author?: string | null;
  outcome?: string;
  reference?: boolean;
}

export function EvaluationTimeline({
  entries,
  onNavigate,
  children,
}: {
  entries: EvaluationTimelineEntry[];
  onNavigate: (id: string) => void;
  children: (isMobile: boolean) => ReactNode;
}) {
  const isMobile = useIsMobile();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(entries[0]?.id);
  const active = entries.find((entry) => entry.id === activeId) ?? entries[0];

  function navigate(id: string) {
    onNavigate(id);
    setActiveId(id);
    // Wait for a collapsed round to expand before measuring its position.
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const target = [
        ...(viewport?.querySelectorAll<HTMLElement>("[data-evaluation-id]") ?? []),
      ].find((element) => element.dataset.evaluationId === id);
      if (!viewport || !target) {
        return;
      }
      viewport.scrollTo({
        behavior: "instant",
        top: isMobile
          ? 0
          : target.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top +
            viewport.scrollTop,
      });
    });
  }

  function syncActiveRound() {
    const viewport = viewportRef.current;
    if (!viewport || isMobile) {
      return;
    }
    const top = viewport.getBoundingClientRect().top + 32;
    const sections = [...viewport.querySelectorAll<HTMLElement>("[data-evaluation-id]")];
    const current =
      sections.findLast((section) => section.getBoundingClientRect().top <= top) ?? sections[0];
    if (current?.dataset.evaluationId) {
      setActiveId(current.dataset.evaluationId);
    }
  }

  if (isMobile) {
    return (
      <ScrollArea className="h-full" scrollFade scrollbars="leave">
        {children(true)}
      </ScrollArea>
    );
  }

  return (
    <ScrollArea
      className="h-full [--scroll-fade-size:1.5rem] [--scroll-fade-t-size:0px]"
      scrollFade
      viewportRef={viewportRef}
      viewportClassName="[container-type:size]"
      viewportProps={{ "aria-label": "评价详情", onScroll: syncActiveRound, tabIndex: 0 }}
    >
      <div className="grid w-full grid-cols-[15rem_minmax(0,1fr)] gap-6 px-3 pt-3 xl:grid-cols-[15rem_minmax(0,1fr)_15rem]">
        <aside className="sticky top-3 flex h-[calc(100cqh-1.5rem)] min-w-0 items-center self-start">
          <nav aria-label="评价时间线" className="max-h-full w-full overflow-y-auto p-1">
            {[true, false].map((reference) => {
              const group = entries.filter((entry) => Boolean(entry.reference) === reference);
              if (!group.length) {
                return null;
              }
              return (
                <div className={cn(!reference && "mt-6")} key={String(reference)}>
                  <ol className="flex flex-col gap-1">
                    {group.map((entry, index) => (
                      <li className="relative min-w-0" key={entry.id}>
                        {!reference && index < group.length - 1 ? (
                          <span
                            aria-hidden="true"
                            className="absolute top-1/2 -bottom-[calc(50%+0.25rem)] left-[1.125rem] w-px bg-border"
                          />
                        ) : null}
                        <Button
                          aria-current={active?.id === entry.id ? "step" : undefined}
                          className="h-auto w-full min-w-0 items-center justify-start gap-2 px-3 py-1.5 text-left"
                          onClick={() => navigate(entry.id)}
                          variant={active?.id === entry.id ? "secondary" : "ghost"}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "relative size-3 shrink-0 rounded-full border-2 border-background",
                              active?.id === entry.id ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className="min-w-0 flex-1 truncate text-xs font-medium"
                              title={entry.title}
                            >
                              {entry.title}
                            </span>
                            {entry.timestamp ? (
                              <span className="shrink-0 whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                                <LocalDateTimeText value={entry.timestamp} format="compact-zh" />
                              </span>
                            ) : null}
                            {entry.outcome ? (
                              <span className="shrink-0 whitespace-nowrap text-[11px] font-normal text-muted-foreground">
                                {entry.outcome}
                              </span>
                            ) : null}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </nav>
        </aside>
        <div className="mx-auto w-full min-w-0 max-w-5xl">{children(false)}</div>
      </div>
    </ScrollArea>
  );
}
