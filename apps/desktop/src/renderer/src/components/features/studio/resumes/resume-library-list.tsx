import { useResumeLibraryLoadMore } from "./use-resume-library-load-more";
import {
  STUDIO_DATE_GROUP_ROW_HEIGHT,
  StudioStickyDateGroupHeader,
  buildStudioDateGroupedVirtualRows,
  buildStudioStickyDateHeaderPositions,
  useStudioStickyDateGroup,
} from "../studio-date-group-virtual-list";
import { useElementScrollRestoration, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { DESKTOP_SCROLL_TO_TOP_EVENT } from "@/components/features/studio/desktop-scroll-to-top-button";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { useResumeLibraryCardHeight } from "./card-height";
import { ResumeLibraryCard } from "./resume-library-card";
import { ResumeLibraryListSkeleton } from "./resume-library-list-skeleton";
import {
  findDesktopMainScrollElement,
  DESKTOP_MAIN_SCROLL_RESTORATION_ID,
  useResumeLibraryScrollElement,
} from "./scroll-element";

interface ResumeLibraryListProps {
  emptyHint?: string;
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  onRetry: () => void;
  records: ResumeLibraryListRecord[];
  total: number;
}

function errorMessage(error: Error | null): string {
  if (error?.message) {
    return error.message;
  }
  return "加载失败";
}

export function ResumeLibraryList({
  emptyHint = "当前工作区还没有招聘台记录",
  error,
  fetchNextPage,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isInitialLoading,
  onRetry,
  records,
  total,
}: ResumeLibraryListProps) {
  const navigate = useNavigate();
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const virtualListRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scrollElement = useResumeLibraryScrollElement(listRootRef);
  const cardHeight = useResumeLibraryCardHeight();
  const scrollEntry = useElementScrollRestoration({ id: DESKTOP_MAIN_SCROLL_RESTORATION_ID });

  const virtualRows = useMemo(
    () => buildStudioDateGroupedVirtualRows(records, "createdAt"),
    [records],
  );
  const getVirtualItemKey = useCallback(
    (index: number) => virtualRows[index]?.id ?? `resume-placeholder-${index}`,
    [virtualRows],
  );
  const getVirtualRowSize = useCallback(
    (index: number) =>
      virtualRows[index]?.type === "date-header" ? STUDIO_DATE_GROUP_ROW_HEIGHT : cardHeight,
    [cardHeight, virtualRows],
  );
  const positions = useMemo(
    () => buildStudioStickyDateHeaderPositions(virtualRows, cardHeight),
    [cardHeight, virtualRows],
  );
  const getScrollElement = useCallback(() => scrollElement, [scrollElement]);
  const { rangeExtractor, stickyState } = useStudioStickyDateGroup({
    getScrollElement,
    listRootRef: virtualListRootRef,
    positions,
  });

  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: virtualRows.length,
    estimateSize: getVirtualRowSize,
    getItemKey: getVirtualItemKey,
    getScrollElement,
    initialOffset: scrollEntry?.scrollY,
    overscan: 6,
    rangeExtractor,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [cardHeight, virtualizer]);

  useEffect(() => {
    const onScrollToTop = () => {
      const viewport = scrollElement ?? findDesktopMainScrollElement();
      if (viewport) {
        viewport.scrollTop = 0;
      }
      virtualizer.scrollToOffset(0, { align: "start" });
    };
    window.addEventListener(DESKTOP_SCROLL_TO_TOP_EVENT, onScrollToTop);
    return () => window.removeEventListener(DESKTOP_SCROLL_TO_TOP_EVENT, onScrollToTop);
  }, [scrollElement, virtualizer]);

  const handleOpenDetail = useCallback(
    (record: ResumeLibraryListRecord) => {
      void navigate({
        params: { recordId: record.id },
        resetScroll: false,
        to: "/recruitment/overlay/$recordId",
      });
    },
    [navigate],
  );

  useResumeLibraryLoadMore({
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    loadMoreRef,
    scrollElement,
  });

  let loadMoreStatusText = "已显示全部简历";
  if (error) {
    loadMoreStatusText = "加载失败，请重试";
  } else if (hasNextPage) {
    loadMoreStatusText = isFetchingNextPage
      ? "正在加载更多简历"
      : `已显示 ${records.length} / ${total} 条，继续下滑加载更多`;
  }

  let listContent: ReactNode;

  const isColdLoading = isInitialLoading && records.length === 0;

  if (isColdLoading) {
    listContent = null;
  } else if (error && records.length === 0) {
    listContent = (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        <Button onClick={onRetry} type="button" variant="outline">
          重试
        </Button>
      </div>
    );
  } else if (records.length === 0) {
    listContent = (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="font-medium text-sm">暂无简历</p>
        <p className="mt-1 text-muted-foreground text-xs">{emptyHint}</p>
      </div>
    );
  } else {
    const virtualItems = virtualizer.getVirtualItems();
    listContent = (
      <>
        <div
          ref={virtualListRootRef}
          className="relative transition-opacity"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualItems.map((virtualRow) => {
            const row = virtualRows[virtualRow.index];
            if (!row) {
              return null;
            }
            if (row.type === "date-header") {
              const active = virtualRow.index === stickyState.index;
              return (
                <StudioStickyDateGroupHeader
                  active={active}
                  headingId={`desktop-resumes-${row.id}`}
                  isStuck={active && stickyState.isStuck}
                  key={virtualRow.key}
                  label={row.label}
                  onNavigate={() => virtualizer.scrollToIndex(virtualRow.index, { align: "start" })}
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
                data-resume-record-id={record.id}
                key={virtualRow.key}
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ResumeLibraryCard onOpenDetail={handleOpenDetail} record={record} />
              </div>
            );
          })}
        </div>
        <div
          className="flex min-h-10 items-center justify-center text-muted-foreground text-sm"
          ref={loadMoreRef}
        >
          {error ? (
            <div className="flex items-center gap-3" role="alert">
              <span>{errorMessage(error)}</span>
              <Button disabled={isFetching} onClick={onRetry} size="sm" variant="outline">
                重试
              </Button>
            </div>
          ) : (
            loadMoreStatusText
          )}
        </div>
      </>
    );
  }

  return (
    // Include the sentinel: anchoring to it would chase each appended page indefinitely.
    <div className="flex flex-col gap-4 [overflow-anchor:none]" ref={listRootRef}>
      <SkeletonReveal
        contentClassName="min-w-0"
        loading={isColdLoading}
        skeleton={<ResumeLibraryListSkeleton cardHeight={cardHeight} />}
      >
        {listContent}
      </SkeletonReveal>
    </div>
  );
}
