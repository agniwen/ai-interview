import {
  getRecruitingBoardGroup,
  recruitingBoardGroups,
  resolveRecruitingBoardView,
} from "@app/shared/recruiting-board";
import { useEffect, useRef, useState } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@app/shared/utils";

const TAB_COUNT_MAX = 999;
/** 已结束是终态归档，不需要提醒式角标。 */
const BADGE_HIDDEN_GROUPS = new Set(["closed"]);

/** 角标超过上限时显示“999+”，保持宽度可控。 */
export function formatRecruitingBoardTabCount(count: number) {
  return count > TAB_COUNT_MAX ? `${TAB_COUNT_MAX}+` : String(count);
}

/** 浮在 tab 右上角的数量角标；用整数像素定位，避免位移带来的小字模糊。 */
function TabCountBadge({
  count,
  mobileInset,
  size = "default",
}: {
  count?: number;
  mobileInset?: boolean;
  /** 子状态 tab 字号更小，角标随之缩小。 */
  size?: "default" | "sm";
}) {
  if (!count) {
    return null;
  }
  return (
    <span
      aria-label={`${count} 人`}
      className={cn(
        "pointer-events-none absolute z-10 inline-flex items-center justify-center rounded-full bg-destructive font-semibold text-white tabular-nums leading-none antialiased",
        size === "sm"
          ? "-top-2 -right-1.5 h-4 min-w-4 px-1 text-[10px]"
          : "-top-2.5 -right-1 h-5 min-w-5 px-1.5 text-[11px]",
        mobileInset && "max-sm:top-0.5 max-sm:right-0.5",
      )}
      data-slot="recruiting-board-tab-count"
    >
      {formatRecruitingBoardTabCount(count)}
    </span>
  );
}

export function RecruitingBoardTabs({
  counts,
  fixedGroupId,
  onChange,
  value,
  viewCounts,
}: {
  /** 主标签计数（按主阶段 id）；缺省或为 0 时不显示角标。 */
  counts?: ReadonlyMap<string, number>;
  fixedGroupId?: string;
  onChange: (value: string) => void;
  value: string;
  /** 固定子菜单页的子状态计数（按视图值）；“全部”子标签沿用该主阶段计数。 */
  viewCounts?: ReadonlyMap<string, number>;
}) {
  const view = resolveRecruitingBoardView(value);
  const fixedGroup = recruitingBoardGroups.find(
    (entry) => entry.id !== "all" && entry.id === fixedGroupId,
  );
  const group = fixedGroup ?? getRecruitingBoardGroup(view);
  const selectedView = group.tabs.some((entry) => entry.value === view)
    ? view
    : group.tabs[0].value;
  const showSubtabCounts = Boolean(fixedGroup && viewCounts) && !BADGE_HIDDEN_GROUPS.has(group.id);
  const subtabCount = (tabValue: string) => {
    if (!showSubtabCounts) {
      return;
    }
    return tabValue.endsWith(":all") ? counts?.get(group.id) : viewCounts?.get(tabValue);
  };
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
          <TabsList aria-label="招聘阶段" className="w-full sm:w-fit sm:overflow-visible">
            {recruitingBoardGroups.map((entry) => {
              const count = BADGE_HIDDEN_GROUPS.has(entry.id) ? undefined : counts?.get(entry.id);
              return (
                <TabsTrigger
                  className="h-10! flex-1 px-4 text-sm sm:flex-none sm:px-6"
                  key={entry.id}
                  value={entry.id}
                >
                  {entry.label}
                  <TabCountBadge count={count} mobileInset />
                </TabsTrigger>
              );
            })}
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
            className={cn(
              "w-max max-w-none gap-1 overflow-visible px-3",
              showSubtabCounts && "data-[orientation=horizontal]:pt-2.5",
            )}
            variant="underline"
          >
            {group.tabs.map((entry) => (
              <TabsTrigger className="h-8! px-3 text-xs!" key={entry.value} value={entry.value}>
                {entry.label}
                <TabCountBadge count={subtabCount(entry.value)} size="sm" />
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
