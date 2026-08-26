import { IconHistory } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { canDeleteResumeRecord } from "@arc/shared/studio-resumes";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import type { ToolbarFilterConfig } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { ResumeUploadEntryButton } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { ResumeLibraryCard } from "@/components/features/studio/resumes/resume-library-card";
import type { ResumeDetailDefaultTab } from "@/components/features/studio/resumes/resume-library-card";
import { ResumeLibraryFloatingActionBar } from "@/components/features/studio/resumes/resume-library-floating-action-bar";
import { ListLoadError } from "@/components/data-grid/list-load-error";
import {
  STUDIO_DATE_GROUP_ROW_HEIGHT,
  StudioDateGroupHeaderSkeleton,
  StudioStickyDateGroupHeader,
  buildStudioDateGroupedVirtualRows,
  buildStudioStickyDateHeaderPositions,
  useStudioStickyDateGroup,
} from "@/components/features/studio/studio-date-group-virtual-list";
import { shouldShowStudioListLoadingState } from "@/components/features/studio/studio-list-loading-state";

import {
  formatResumeLibraryJobDescriptionLabel,
  useResumeLibraryCardHeight,
  useResumeLibraryInitialScrollOffset,
  useResumeLibraryScrollElement,
} from "./resume-library-page-model";
import type { ResumeLibraryGridState } from "./resume-library-page-model";
import { ResumeLibraryCardSkeleton } from "./resume-library-card-skeleton";

function getResumeLibrarySortBy(grid: ResumeLibraryGridState) {
  return grid.sorting[0]?.id ?? "createdAt";
}

function ResumeLibraryLoadingState({ showDateGroup }: { showDateGroup: boolean }) {
  return (
    <div className="grid">
      {showDateGroup ? <StudioDateGroupHeaderSkeleton /> : null}
      {Array.from({ length: 4 }, (_, index) => (
        <ResumeLibraryCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function shouldShowResumeLibraryLoadingState({
  error,
  isInitialLoading,
  isRefetching,
  recordCount,
}: {
  error: Error | null;
  isInitialLoading: boolean;
  isRefetching: boolean;
  recordCount: number;
}) {
  return (
    !error &&
    shouldShowStudioListLoadingState({
      isInitialLoading,
      isRefetching,
      recordCount,
    })
  );
}

interface ResumeLibraryCardListProps {
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canForceReparse: boolean;
  canReadResumeUploadBatch: boolean;
  canRetryResumeParse: boolean;
  canUpdateResumeLibrary: boolean;
  canUploadResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  empty: ReactNode;
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  filters: ToolbarFilterConfig[];
  grid: ResumeLibraryGridState;
  hasNextPage: boolean;
  onBulkDelete: () => void;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onForceReparse: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenBatchList: () => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onOpenUploadEntry: () => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onRetryParse: (record: ResumeLibraryListRecord) => void;
  onRetry: () => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  records: ResumeLibraryListRecord[];
  retryingRecordId: string | null;
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  isRefetching: boolean;
  total: number;
  uploadEntryDisabled: boolean;
  hasActiveUploadBatches: boolean;
}

export function ResumeLibraryCardList({
  canCreateInterview,
  canDeleteResumeLibrary,
  canForceReparse,
  canReadResumeUploadBatch,
  canRetryResumeParse,
  canUpdateResumeLibrary,
  canUploadResumeLibrary,
  currentMemberRole,
  currentUserId,
  empty,
  error,
  fetchNextPage,
  filters,
  grid,
  hasNextPage,
  hasActiveUploadBatches,
  isFetchingNextPage,
  isInitialLoading,
  isRefetching,
  onBulkDelete,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onForceReparse,
  onLaunchInterview,
  onOpenBatchList,
  onOpenDetail,
  onOpenUploadEntry,
  onPreviewResume,
  onRetryParse,
  onRetry,
  onShowDuplicateMatches,
  onTransition,
  records,
  retryingRecordId,
  total,
  uploadEntryDisabled,
}: ResumeLibraryCardListProps) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const virtualListRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const scrollElement = useResumeLibraryScrollElement(listRootRef);
  const cardHeight = useResumeLibraryCardHeight();
  const { setRowSelection } = grid;
  const initialScrollOffset = useResumeLibraryInitialScrollOffset();
  const sortBy = getResumeLibrarySortBy(grid);
  const virtualRows = useMemo(
    () => buildStudioDateGroupedVirtualRows(records, sortBy),
    [records, sortBy],
  );
  const getVirtualRowSize = useCallback(
    (index: number) =>
      virtualRows[index]?.type === "date-header" ? STUDIO_DATE_GROUP_ROW_HEIGHT : cardHeight,
    [cardHeight, virtualRows],
  );
  const stickyHeaderPositions = useMemo(
    () => buildStudioStickyDateHeaderPositions(virtualRows, cardHeight),
    [cardHeight, virtualRows],
  );
  const getScrollElement = useCallback(() => scrollElement, [scrollElement]);
  const getVirtualItemKey = useCallback(
    (index: number) => virtualRows[index]?.id ?? `resume-placeholder-${index}`,
    [virtualRows],
  );
  const { rangeExtractor, stickyState } = useStudioStickyDateGroup({
    getScrollElement,
    listRootRef: virtualListRootRef,
    positions: stickyHeaderPositions,
  });
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is compiler-incompatible and is intentionally skipped.
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: virtualRows.length,
    estimateSize: getVirtualRowSize,
    getItemKey: getVirtualItemKey,
    getScrollElement,
    initialOffset: initialScrollOffset,
    overscan: 6,
    rangeExtractor,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [cardHeight, virtualizer]);
  const virtualItems = virtualizer.getVirtualItems();
  const selectedIds = useMemo(
    () => Object.keys(grid.bind.rowSelection).filter((id) => grid.bind.rowSelection[id]),
    [grid.bind.rowSelection],
  );
  const selectedRows = useMemo(
    () => records.filter((record) => grid.bind.rowSelection[record.id]),
    [records, grid.bind.rowSelection],
  );
  const handleSelectionChange = useCallback(
    (recordId: string, checked: boolean) => {
      setRowSelection((previous) => ({ ...previous, [recordId]: checked }));
    },
    [setRowSelection],
  );
  const selectedItems = useMemo(
    () =>
      selectedRows.map((record) => ({
        id: record.id,
        jobDescriptionLabel: formatResumeLibraryJobDescriptionLabel(record),
        name: formatResumeCandidateTitle(record.candidateName, record.id),
      })),
    [selectedRows],
  );
  const hasLockedSelection = selectedRows.some(
    (record) => !canDeleteResumeRecord(record.resumeParseStatus),
  );
  const bulkDeleteLockedReason = hasLockedSelection
    ? "所选记录包含解析中的简历，暂不能删除"
    : undefined;
  const canShowFloatingActionBar = canDeleteResumeLibrary && selectedIds.length > 0;
  useEffect(() => {
    const node = loadMoreRef.current;
    const IntersectionObserverConstructor = globalThis.IntersectionObserver;
    if (!node || !hasNextPage || !IntersectionObserverConstructor) {
      return;
    }
    const observer = new IntersectionObserverConstructor(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scrollElement, rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, scrollElement]);

  let loadMoreStatusText = "已显示全部简历";
  if (hasNextPage) {
    loadMoreStatusText = isFetchingNextPage
      ? "正在加载更多简历"
      : `已显示 ${records.length} / ${total} 条，继续下滑加载更多`;
  }

  let listContent: ReactNode = empty;
  if (error && records.length === 0) {
    listContent = <ListLoadError error={error} onRetry={onRetry} />;
  } else if (records.length > 0) {
    listContent = (
      <>
        {error ? <ListLoadError compact error={error} onRetry={onRetry} /> : null}
        <div
          className="relative transition-opacity [overflow-anchor:none]"
          ref={virtualListRootRef}
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
                  headingId={`resume-library-${row.id}`}
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
                data-resume-record-id={record.id}
                key={virtualRow.key}
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ResumeLibraryCard
                  canCreateInterview={canCreateInterview}
                  canDeleteResumeLibrary={canDeleteResumeLibrary}
                  canForceReparse={canForceReparse}
                  canRetryResumeParse={canRetryResumeParse}
                  canUpdateResumeLibrary={canUpdateResumeLibrary}
                  currentMemberRole={currentMemberRole}
                  currentUserId={currentUserId}
                  onCopyDetailLink={onCopyDetailLink}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onForceReparse={onForceReparse}
                  onLaunchInterview={onLaunchInterview}
                  onOpenDetail={onOpenDetail}
                  onPreviewResume={onPreviewResume}
                  onRetryParse={onRetryParse}
                  onSelectChange={handleSelectionChange}
                  onShowDuplicateMatches={onShowDuplicateMatches}
                  onTransition={onTransition}
                  record={record}
                  retrying={retryingRecordId === record.id}
                  selected={Boolean(grid.bind.rowSelection[record.id])}
                />
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
    <div
      className="flex flex-col gap-4 [&_[data-slot=combobox-chips]]:!rounded-lg [&_[data-slot=input-control]:not([data-slot=filter-chip]_*)]:!rounded-lg [&_[data-slot=input-group]]:!rounded-lg"
      ref={listRootRef}
    >
      <Toolbar
        filterStorageKey="studio-resumes"
        canResetFilters={grid.bind.canResetFilters}
        filterValues={grid.bind.filterValues}
        filters={filters}
        onFilterChange={grid.bind.onFilterChange}
        onRefresh={grid.bind.onRefresh}
        onResetFilters={grid.bind.onResetFilters}
        refreshing={isRefetching}
        searchLoading={isInitialLoading}
        toolbarRight={
          canUploadResumeLibrary || canReadResumeUploadBatch ? (
            <ButtonGroup>
              {canUploadResumeLibrary ? (
                <ResumeUploadEntryButton
                  disabled={uploadEntryDisabled}
                  onClick={onOpenUploadEntry}
                />
              ) : null}
              {canReadResumeUploadBatch && hasActiveUploadBatches ? (
                <Button onClick={onOpenBatchList} type="button">
                  <IconHistory className="size-4" />
                </Button>
              ) : null}
            </ButtonGroup>
          ) : null
        }
      />

      <SkeletonReveal
        loading={shouldShowResumeLibraryLoadingState({
          error,
          isInitialLoading,
          isRefetching,
          recordCount: records.length,
        })}
        skeleton={<ResumeLibraryLoadingState showDateGroup={sortBy === "createdAt"} />}
      >
        {listContent}
      </SkeletonReveal>
      {canShowFloatingActionBar ? (
        <ResumeLibraryFloatingActionBar
          disabled={hasLockedSelection}
          disabledReason={bulkDeleteLockedReason}
          onClearSelection={() => grid.setRowSelection({})}
          onBulkDelete={onBulkDelete}
          onRemoveItem={(id) => grid.setRowSelection((prev) => ({ ...prev, [id]: false }))}
          onViewItem={(id) => {
            const record = records.find((item) => item.id === id);
            if (record) {
              onOpenDetail(record);
            }
          }}
          selectedCount={selectedIds.length}
          selectedItems={selectedItems}
        />
      ) : null}
    </div>
  );
}

// 页面组件天然汇聚多种 dialog/state，复杂度阈值（20）会被踩到。
// 这是 UI 编排层，不是业务逻辑层；拆成更小组件会牺牲就近可读性。
// Page-level orchestrator naturally aggregates dialogs and state; splitting
// would harm local readability without reducing real complexity.
// oxlint-disable-next-line eslint/complexity
