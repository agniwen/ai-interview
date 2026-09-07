import {
  getRecruitingBoardGroup,
  recruitingBoardGroups,
  resolveRecruitingBoardView,
} from "@app/shared/recruiting-board";
import { useEffect, useRef, useState } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function RecruitingBoardTabs({
  fixedGroupId,
  onChange,
  value,
}: {
  fixedGroupId?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const view = resolveRecruitingBoardView(value);
  const fixedGroup = recruitingBoardGroups.find(
    (entry) => entry.id !== "all" && entry.id === fixedGroupId,
  );
  const group = fixedGroup ?? getRecruitingBoardGroup(view);
  const selectedView = group.tabs.some((entry) => entry.value === view)
    ? view
    : group.tabs[0].value;
  const viewportRef = useRef<HTMLElement | null>(null);
  const [scrollReady, setScrollReady] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const revealSelected = () => {
      const selected = viewport.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selected) {
        return;
      }
      const bounds = viewport.getBoundingClientRect();
      const tabBounds = selected.getBoundingClientRect();
      if (tabBounds.left < bounds.left) {
        viewport.scrollLeft += tabBounds.left - bounds.left - 8;
      } else if (tabBounds.right > bounds.right) {
        viewport.scrollLeft += tabBounds.right - bounds.right + 8;
      }
    };
    revealSelected();
    const observer = new MutationObserver(revealSelected);
    observer.observe(viewport, {
      attributeFilter: ["aria-selected"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    const resizeObserver = new ResizeObserver(revealSelected);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver.observe(viewport.firstElementChild);
    }
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [scrollReady, selectedView]);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
      {fixedGroup ? null : (
        <Tabs
          value={group.id}
          onValueChange={(id) => {
            const next = recruitingBoardGroups.find((entry) => entry.id === id);
            if (next) {
              onChange(next.tabs[0].value);
            }
          }}
        >
          <TabsList aria-label="招聘阶段" className="w-full sm:w-fit">
            {recruitingBoardGroups.map((entry) => (
              <TabsTrigger
                className="h-10! flex-1 px-4 text-sm sm:flex-none sm:px-7"
                key={entry.id}
                value={entry.id}
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <Tabs
        className="min-w-0 max-w-full"
        value={selectedView}
        onValueChange={(next) => onChange(String(next))}
      >
        <ScrollArea
          className="w-full max-w-6xl [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%_-_12px),transparent)]"
          events={{
            initialized: (instance: OverlayScrollbars) => {
              viewportRef.current = instance.elements().viewport;
              setScrollReady(true);
            },
          }}
          options={{
            overflow: { x: "scroll", y: "hidden" },
            scrollbars: { autoHide: "leave", autoHideDelay: 600, theme: "os-theme-app" },
          }}
          scrollbars="leave"
        >
          <TabsList
            aria-label={`${group.label}子流程`}
            className="w-max max-w-none gap-1 overflow-visible px-3"
            variant="underline"
          >
            {group.tabs.map((entry) => (
              <TabsTrigger className="h-8! px-3 text-xs!" key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
