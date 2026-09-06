import {
  getRecruitingBoardGroup,
  recruitingBoardGroups,
  resolveRecruitingBoardView,
} from "@app/shared/recruiting-board";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";

/** 主分组与子流程共同编码进 URL，刷新、分享及列表缓存都使用同一选择。 */
export function RecruitingBoardTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const view = resolveRecruitingBoardView(value);
  const group = getRecruitingBoardGroup(view);
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
    // Base UI 水合后才完成选中标记；同时响应容器宽度变化。
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
  }, [view, scrollReady]);
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3">
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
              key={entry.id}
              value={entry.id}
              className="h-10! flex-1 px-4 text-sm sm:flex-none sm:px-7"
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs
        className="min-w-0 max-w-full"
        value={view}
        onValueChange={(next) => onChange(String(next))}
      >
        <ScrollArea
          className="w-full max-w-6xl [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%_-_12px),transparent)]"
          scrollbars="leave"
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
        >
          <TabsList
            aria-label={`${group.label}子流程`}
            variant="underline"
            className="w-max max-w-none gap-1 overflow-visible px-3"
          >
            {group.tabs.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="h-8! px-3 text-xs!">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
