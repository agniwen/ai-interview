import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { useResumeLibraryCardHeight } from "./card-height";
import { ResumeLibraryCard } from "./resume-library-card";

interface ResumeLibraryListProps {
  error: unknown;
  fetchNextPage: () => Promise<unknown>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  onRetry: () => void;
  records: ResumeLibraryListRecord[];
  total: number;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "加载失败";
}

export function ResumeLibraryList({
  error,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isInitialLoading,
  onRetry,
  records,
  total,
}: ResumeLibraryListProps) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const cardHeight = useResumeLibraryCardHeight();

  const getScrollElement = useCallback(() => {
    const byId = document.querySelector<HTMLElement>('[data-scroll-restoration-id="desktop-main"]');
    if (byId) {
      return byId;
    }
    const root = listRootRef.current;
    if (!root) {
      return null;
    }
    // Prefer the nearest OverlayScrollbars / overflow scroll parent from the shell.
    let node: HTMLElement | null = root.parentElement;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
        return node;
      }
      // OverlayScrollbars viewport class
      if (node.classList.contains("os-viewport")) {
        return node;
      }
      node = node.parentElement;
    }
    return document.documentElement;
  }, []);

  const getVirtualItemKey = useCallback(
    (index: number) => records[index]?.id ?? `resume-placeholder-${index}`,
    [records],
  );

  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: records.length,
    estimateSize: () => cardHeight,
    getItemKey: getVirtualItemKey,
    getScrollElement,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [cardHeight, virtualizer]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const scrollElement = getScrollElement();
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scrollElement instanceof Element ? scrollElement : null, rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, getScrollElement, hasNextPage, isFetchingNextPage]);

  let loadMoreStatusText = "已显示全部简历";
  if (hasNextPage) {
    loadMoreStatusText = isFetchingNextPage
      ? "正在加载更多简历"
      : `已显示 ${records.length} / ${total} 条，继续下滑加载更多`;
  }

  let listContent: ReactNode;

  if (error && records.length === 0) {
    listContent = (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
        <Button onClick={onRetry} type="button" variant="outline">
          重试
        </Button>
      </div>
    );
  } else if (isInitialLoading) {
    listContent = (
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-44 rounded-2xl" key={index} />
        ))}
      </div>
    );
  } else if (records.length === 0) {
    listContent = (
      <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
        <p className="font-medium text-sm">暂无简历</p>
        <p className="mt-1 text-muted-foreground text-xs">当前工作区还没有招聘台记录</p>
      </div>
    );
  } else {
    const virtualItems = virtualizer.getVirtualItems();
    listContent = (
      <>
        {error ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{errorMessage(error)}</span>
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              重试
            </Button>
          </div>
        ) : null}
        <div className="relative transition-opacity" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => {
            const record = records[virtualRow.index];
            if (!record) {
              return null;
            }
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
                <ResumeLibraryCard record={record} />
              </div>
            );
          })}
        </div>
        <div
          className="flex min-h-10 items-center justify-center text-muted-foreground text-sm"
          ref={loadMoreRef}
        >
          {loadMoreStatusText}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4" ref={listRootRef}>
      {listContent}
    </div>
  );
}
