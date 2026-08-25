"use client";

import { IconFileText, IconHistory, IconUserPlus } from "@tabler/icons-react";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { cn } from "@arc/shared/utils";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";

import { ResumePoolCard, useResumePoolCardHeight } from "./resume-pool-card";
import { buildResumePoolVirtualRows, resolveResumePoolStickyState } from "./resume-pool-page-model";

const RESUME_POOL_DATE_HEADER_HEIGHT = 44;

function ResumePoolStickyDateGroupHeader({
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
        active ? "sticky z-20" : "absolute",
        isStuck && "border-input bg-background/80 backdrop-blur-md",
      )}
      style={{
        height: RESUME_POOL_DATE_HEADER_HEIGHT,
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

export function ResumePoolLoadingState() {
  return (
    <output aria-label="正在加载简历" className="grid gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton className="h-[218px] rounded-xl max-lg:h-[246px] max-md:h-[286px]" key={index} />
      ))}
    </output>
  );
}

export function ResumePoolEmptyState({
  canUpload,
  canResetFilters,
  emptyTitle,
  onUpload,
  onResetFilters,
}: {
  canUpload: boolean;
  canResetFilters: boolean;
  emptyTitle: string;
  onUpload: () => void;
  onResetFilters: () => void;
}) {
  let action: ReactNode = null;
  if (canResetFilters) {
    action = (
      <EmptyContent>
        <Button onClick={onResetFilters} variant="outline">
          清除筛选
        </Button>
      </EmptyContent>
    );
  } else if (canUpload) {
    action = (
      <EmptyContent>
        <Button onClick={onUpload}>
          <IconUserPlus data-icon="inline-start" />
          创建人才记录
        </Button>
      </EmptyContent>
    );
  }
  return (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFileText />
        </EmptyMedia>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
      </EmptyHeader>
      {action}
    </Empty>
  );
}

export function ResumePoolListContent({
  canEnterRecruiting,
  canResetFilters,
  canUpload,
  emptyTitle,
  enteringRecruitingRecordId,
  isInitialPoolLoading,
  onEnterRecruiting,
  onOpenDetail,
  onResetFilters,
  onUpload,
  records,
  showEmptyState,
  sortBy,
}: {
  canEnterRecruiting: boolean;
  canResetFilters: boolean;
  canUpload: boolean;
  emptyTitle: string;
  enteringRecruitingRecordId: string | null;
  isInitialPoolLoading: boolean;
  onEnterRecruiting: (record: ResumePoolListRecord) => void;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onResetFilters: () => void;
  onUpload: () => void;
  records: ResumePoolListRecord[];
  showEmptyState: boolean;
  sortBy: string | undefined;
}) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const cardHeight = useResumePoolCardHeight();
  const virtualRows = useMemo(() => buildResumePoolVirtualRows(records, sortBy), [records, sortBy]);
  const getVirtualRowSize = useCallback(
    (index: number) =>
      virtualRows[index]?.type === "date-header" ? RESUME_POOL_DATE_HEADER_HEIGHT : cardHeight,
    [cardHeight, virtualRows],
  );
  const stickyHeaderPositions = useMemo(() => {
    const positions: { index: number; start: number }[] = [];
    let start = 0;
    for (const [index, row] of virtualRows.entries()) {
      if (row.type === "date-header") {
        positions.push({ index, start });
      }
      start += getVirtualRowSize(index);
    }
    return positions;
  }, [getVirtualRowSize, virtualRows]);
  const [stickyState, setStickyState] = useState({
    index: -1,
    isStuck: false,
    pushOffset: 0,
    stickyTop: 0,
  });
  const studioScrollEntry = useElementScrollRestoration({
    id: STUDIO_MAIN_SCROLL_RESTORATION_ID,
  });
  const getScrollElement = useCallback(
    () =>
      listRootRef.current?.closest<HTMLElement>(
        '[data-scroll-restoration-id="studio-main-scroll"]',
      ) ?? null,
    [],
  );
  const getVirtualItemKey = useCallback(
    (index: number) => virtualRows[index]?.id ?? `resume-pool-placeholder-${index}`,
    [virtualRows],
  );
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
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is compiler-incompatible and is intentionally skipped.
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: virtualRows.length,
    estimateSize: getVirtualRowSize,
    getItemKey: getVirtualItemKey,
    getScrollElement,
    initialOffset: studioScrollEntry?.scrollY,
    overscan: 6,
    rangeExtractor,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [cardHeight, virtualizer]);

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
          ...resolveResumePoolStickyState(
            stickyHeaderPositions,
            stickyLineWithinList,
            RESUME_POOL_DATE_HEADER_HEIGHT,
          ),
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
  }, [getScrollElement, stickyHeaderPositions]);

  if (isInitialPoolLoading) {
    return <ResumePoolLoadingState />;
  }

  if (showEmptyState) {
    return (
      <ResumePoolEmptyState
        canUpload={canUpload}
        canResetFilters={canResetFilters}
        emptyTitle={emptyTitle}
        onResetFilters={onResetFilters}
        onUpload={onUpload}
      />
    );
  }

  if (records.length === 0) {
    return null;
  }

  return (
    <div ref={listRootRef}>
      <div
        className="relative [overflow-anchor:none]"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = virtualRows[virtualRow.index];
          if (!row) {
            return null;
          }
          if (row.type === "date-header") {
            const active = virtualRow.index === stickyState.index;
            return (
              <ResumePoolStickyDateGroupHeader
                active={active}
                headingId={`resume-pool-${row.id}`}
                isStuck={active && stickyState.isStuck}
                key={virtualRow.key}
                label={row.label}
                onNavigate={() =>
                  virtualizer.scrollToIndex(virtualRow.index, {
                    align: "start",
                    behavior: "smooth",
                  })
                }
                pushOffset={active ? stickyState.pushOffset : 0}
                recordCount={row.recordCount}
                start={virtualRow.start}
                stickyTop={stickyState.stickyTop}
              />
            );
          }
          const { record } = row;
          return (
            <div
              className="absolute top-0 left-0 w-full pb-3 [contain:layout]"
              data-index={virtualRow.index}
              data-resume-pool-record-id={record.id}
              key={virtualRow.key}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ResumePoolCard
                canEnterRecruiting={canEnterRecruiting}
                enteringRecruiting={enteringRecruitingRecordId === record.id}
                onEnterRecruiting={onEnterRecruiting}
                onOpenDetail={onOpenDetail}
                record={record}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ResumePoolToolbarActions({
  canOpenBatchList,
  canUpload,
  hasActiveUploadBatches,
  onOpenBatchList,
  onUpload,
}: {
  canOpenBatchList: boolean;
  canUpload: boolean;
  hasActiveUploadBatches: boolean;
  onOpenBatchList: () => void;
  onUpload: () => void;
}) {
  if (!canUpload && !canOpenBatchList) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup>
        {canUpload ? (
          <Button className="sm:w-auto" onClick={onUpload}>
            <IconUserPlus data-icon="inline-start" />
            创建人才记录
          </Button>
        ) : null}
        {canOpenBatchList && hasActiveUploadBatches ? (
          <Button
            aria-label="查看上传记录"
            onClick={onOpenBatchList}
            title="查看上传记录"
            type="button"
          >
            <IconHistory />
          </Button>
        ) : null}
      </ButtonGroup>
    </div>
  );
}
