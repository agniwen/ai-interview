"use client";

import { cn } from "@app/shared/utils";
import { formatDateInAppTimeZone } from "@app/shared/utils/time";
import { defaultRangeExtractor } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export const STUDIO_DATE_GROUP_HEADER_HEIGHT = 44;
export const STUDIO_DATE_GROUP_HEADER_GAP = 12;
export const STUDIO_DATE_GROUP_ROW_HEIGHT =
  STUDIO_DATE_GROUP_HEADER_HEIGHT + STUDIO_DATE_GROUP_HEADER_GAP;

interface StudioDateGroupedRecord {
  createdAt: string;
  id: string;
}

export interface StudioDateGroup<TRecord> {
  id: string;
  label: string;
  records: TRecord[];
}

export type StudioDateGroupedVirtualRow<TRecord> =
  | { id: string; label: string; recordCount: number; type: "date-header" }
  | { id: string; record: TRecord; type: "record" };

export interface StudioStickyDateHeaderPosition {
  index: number;
  start: number;
}

interface StudioStickyDateGroupState {
  index: number;
  isStuck: boolean;
  pushOffset: number;
  stickyTop: number;
}

function dateKeyInAppTimeZone(value: string | Date) {
  return formatDateInAppTimeZone(value, "YYYY-MM-DD");
}

function daysBetweenDateKeys(earlier: string, later: string) {
  const earlierTimestamp = Date.parse(`${earlier}T00:00:00+08:00`);
  const laterTimestamp = Date.parse(`${later}T00:00:00+08:00`);
  return Math.round((laterTimestamp - earlierTimestamp) / 86_400_000);
}

export function groupStudioRecordsByCreatedAt<TRecord extends StudioDateGroupedRecord>(
  records: TRecord[],
  now: Date = new Date(),
): StudioDateGroup<TRecord>[] {
  const today = dateKeyInAppTimeZone(now);
  const groups = new Map<string, StudioDateGroup<TRecord>>();

  for (const record of records) {
    const dateKey = dateKeyInAppTimeZone(record.createdAt);
    const dayOffset = daysBetweenDateKeys(dateKey, today);
    let id = `month:${dateKey.slice(0, 7)}`;
    let label = formatDateInAppTimeZone(record.createdAt, "YYYY 年 M 月");

    if (dayOffset === 0) {
      id = "today";
      label = "今天";
    } else if (dayOffset === 1) {
      id = "yesterday";
      label = "昨天";
    } else if (dayOffset === 2) {
      id = "day-before-yesterday";
      label = "前天";
    } else if (dateKey.startsWith(today.slice(0, 7))) {
      id = "earlier-this-month";
      label = "本月更早";
    }

    const group = groups.get(id);
    if (group) {
      group.records.push(record);
    } else {
      groups.set(id, { id, label, records: [record] });
    }
  }

  return [...groups.values()];
}

export function buildStudioDateGroupedVirtualRows<TRecord extends StudioDateGroupedRecord>(
  records: TRecord[],
  sortBy: string | undefined,
  now: Date = new Date(),
): StudioDateGroupedVirtualRow<TRecord>[] {
  if (sortBy !== "createdAt") {
    return records.map((record) => ({
      id: `record:${record.id}`,
      record,
      type: "record" as const,
    }));
  }

  return groupStudioRecordsByCreatedAt(records, now).flatMap((group) => [
    {
      id: `date:${group.id}`,
      label: group.label,
      recordCount: group.records.length,
      type: "date-header" as const,
    },
    ...group.records.map((record) => ({
      id: `record:${record.id}`,
      record,
      type: "record" as const,
    })),
  ]);
}

export function buildStudioStickyDateHeaderPositions<TRecord>(
  rows: readonly StudioDateGroupedVirtualRow<TRecord>[],
  cardHeight: number,
) {
  const positions: StudioStickyDateHeaderPosition[] = [];
  let start = 0;
  for (const [index, row] of rows.entries()) {
    if (row.type === "date-header") {
      positions.push({ index, start });
      start += STUDIO_DATE_GROUP_ROW_HEIGHT;
    } else {
      start += cardHeight;
    }
  }
  return positions;
}

function findActiveStudioStickyDateHeader(
  positions: readonly StudioStickyDateHeaderPosition[],
  stickyLine: number,
): StudioStickyDateHeaderPosition | null {
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const position = positions[index];
    if (position && position.start <= stickyLine) {
      return position;
    }
  }
  return positions[0] ?? null;
}

export function resolveStudioStickyDateGroupState(
  positions: readonly StudioStickyDateHeaderPosition[],
  stickyLine: number,
  headerHeight: number = STUDIO_DATE_GROUP_HEADER_HEIGHT,
) {
  const activeHeader = findActiveStudioStickyDateHeader(positions, stickyLine);
  if (!activeHeader) {
    return { index: -1, isStuck: false, pushOffset: 0 };
  }

  const activePositionIndex = positions.findIndex(({ index }) => index === activeHeader.index);
  const nextHeader = positions[activePositionIndex + 1];
  const isStuck = activeHeader.start <= stickyLine;
  return {
    index: activeHeader.index,
    isStuck,
    pushOffset:
      isStuck && nextHeader ? Math.min(0, nextHeader.start - stickyLine - headerHeight) : 0,
  };
}

export function useStudioStickyDateGroup({
  getScrollElement,
  listRootRef,
  positions,
}: {
  getScrollElement: () => HTMLElement | null;
  listRootRef: RefObject<HTMLElement | null>;
  positions: readonly StudioStickyDateHeaderPosition[];
}) {
  const [stickyState, setStickyState] = useState<StudioStickyDateGroupState>({
    index: -1,
    isStuck: false,
    pushOffset: 0,
    stickyTop: 0,
  });
  const rangeExtractor = useCallback(
    (range: Range) => {
      if (stickyState.index < 0) {
        return defaultRangeExtractor(range);
      }
      return [...new Set([stickyState.index, ...defaultRangeExtractor(range)])].toSorted(
        (left, right) => left - right,
      );
    },
    [stickyState.index],
  );

  useEffect(() => {
    const listNode = listRootRef.current;
    const scrollElement = getScrollElement();
    if (!(listNode && scrollElement)) {
      return;
    }

    const siteHeader = scrollElement.querySelector<HTMLElement>("header");
    let frameId: number | null = null;
    const syncStickyState = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const scrollRect = scrollElement.getBoundingClientRect();
        const stickyViewportLine =
          (siteHeader?.getBoundingClientRect().bottom ?? scrollRect.top) + 8;
        const listViewportTop = listNode.getBoundingClientRect().top;
        const stickyLineWithinList = stickyViewportLine - listViewportTop;
        const nextState = {
          ...resolveStudioStickyDateGroupState(positions, stickyLineWithinList),
          stickyTop: stickyViewportLine - scrollRect.top,
        };
        setStickyState((current) =>
          current.index === nextState.index &&
          current.isStuck === nextState.isStuck &&
          current.pushOffset === nextState.pushOffset &&
          current.stickyTop === nextState.stickyTop
            ? current
            : nextState,
        );
      });
    };

    const ResizeObserverConstructor = globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor
      ? new ResizeObserverConstructor(syncStickyState)
      : null;
    syncStickyState();
    scrollElement.addEventListener("scroll", syncStickyState, { passive: true });
    window.addEventListener("resize", syncStickyState);
    resizeObserver?.observe(listNode.parentElement ?? listNode);
    if (siteHeader) {
      resizeObserver?.observe(siteHeader);
    }
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      scrollElement.removeEventListener("scroll", syncStickyState);
      window.removeEventListener("resize", syncStickyState);
    };
  }, [getScrollElement, listRootRef, positions]);

  return { rangeExtractor, stickyState };
}

export function StudioStickyDateGroupHeader({
  active,
  headingId,
  isStuck,
  label,
  onNavigate,
  pushOffset,
  recordCount,
  start,
  stickyTop,
}: {
  active: boolean;
  headingId: string;
  isStuck: boolean;
  label: string;
  onNavigate: () => void;
  pushOffset: number;
  recordCount: number;
  start: number;
  stickyTop: number;
}) {
  return (
    <div
      className={cn(
        "left-0 z-10 flex w-fit items-center rounded-r-xl border border-transparent px-4 py-2 transition-colors hover:border-input hover:bg-sidebar/70 [contain:layout]",
        active ? "sticky" : "absolute",
        isStuck && "border-input bg-background/80 backdrop-blur-md",
      )}
      style={{
        height: STUDIO_DATE_GROUP_HEADER_HEIGHT,
        top: active ? stickyTop : 0,
        transform: active ? `translateY(${pushOffset}px)` : `translateY(${start}px)`,
      }}
    >
      <h2 className="font-medium text-sm" id={headingId}>
        <button
          className="-mx-4 -my-2 flex items-center gap-2 px-4 py-2 text-left outline-none"
          onClick={onNavigate}
          type="button"
        >
          <span>{label}</span>
          <span className="font-normal text-muted-foreground text-xs">{recordCount} 份简历</span>
        </button>
      </h2>
    </div>
  );
}

export function StudioDateGroupHeaderSkeleton() {
  return (
    <div className="flex h-11 items-center gap-2 px-4" data-slot="date-group-header-skeleton">
      <Skeleton className="h-4 w-10" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}
