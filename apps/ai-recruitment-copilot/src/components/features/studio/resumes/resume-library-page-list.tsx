import { IconArrowsSort, IconHistory } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { canDeleteResumeRecord } from "@arc/shared/studio-resumes";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import type { ToolbarFilterConfig } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ResumeUploadEntryButton } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { ResumeLibraryCard } from "@/components/features/studio/resumes/resume-library-card";
import type { ResumeDetailDefaultTab } from "@/components/features/studio/resumes/resume-library-card";
import { ResumeLibraryFloatingActionBar } from "@/components/features/studio/resumes/resume-library-floating-action-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { ListLoadError } from "@/components/data-grid/list-load-error";

import {
  formatResumeLibraryJobDescriptionLabel,
  resumeLibraryScrollRestoreSnapshot,
  setResumeLibraryScrollRestoreSnapshot,
  useResumeLibraryCardHeight,
  useResumeLibraryInitialScrollRestore,
  useResumeLibraryResizeScrollRestore,
  useResumeLibraryScrollElement,
} from "./resume-library-page-model";
import type { ResumeLibraryGridState } from "./resume-library-page-model";
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
  error: unknown;
  fetchNextPage: () => Promise<unknown>;
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
  onToggleStructuredScoreSort: () => void;
  records: ResumeLibraryListRecord[];
  retryingRecordId: string | null;
  retriedRecordIds: ReadonlySet<string>;
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  isRefetching: boolean;
  total: number;
  structuredScoreSortActive: boolean;
  structuredScoreSortEnabled: boolean;
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
  onToggleStructuredScoreSort,
  records,
  retryingRecordId,
  retriedRecordIds,
  total,
  structuredScoreSortActive,
  structuredScoreSortEnabled,
  uploadEntryDisabled,
}: ResumeLibraryCardListProps) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [initialRestoreSnapshot] = useState(() => resumeLibraryScrollRestoreSnapshot.current);
  const restoreSnapshotRef = useRef(initialRestoreSnapshot);
  const scrollElement = useResumeLibraryScrollElement(listRootRef);
  const cardHeight = useResumeLibraryCardHeight();
  const { setRowSelection } = grid;
  const initialScrollRestore = useResumeLibraryInitialScrollRestore(initialRestoreSnapshot);
  const getVirtualItemKey = useCallback(
    (index: number) => records[index]?.id ?? `resume-placeholder-${index}`,
    [records],
  );
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: records.length,
    estimateSize: () => cardHeight,
    getItemKey: getVirtualItemKey,
    getScrollElement: () => scrollElement,
    initialMeasurementsCache: initialScrollRestore.initialMeasurementsCache,
    initialOffset: initialScrollRestore.initialOffset,
    overscan: 6,
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
  const handleOpenDetail = useCallback(
    (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => {
      const rowElement = listRootRef.current?.querySelector<HTMLElement>(
        `[data-resume-record-id="${record.id}"]`,
      );
      if (scrollElement && rowElement) {
        setResumeLibraryScrollRestoreSnapshot({
          measurements: virtualizer.takeSnapshot(),
          recordId: record.id,
          recordTopInScrollElement:
            rowElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top,
          scrollOffset: scrollElement.scrollTop,
          viewportWidth: scrollElement.clientWidth,
        });
      }
      onOpenDetail(record, tab);
    },
    [onOpenDetail, scrollElement, virtualizer],
  );

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
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

  useResumeLibraryResizeScrollRestore({
    listRootRef,
    records,
    restoreSnapshotRef,
    scrollElement,
    virtualizer,
  });

  let loadMoreStatusText = "已显示全部简历";
  if (hasNextPage) {
    loadMoreStatusText = isFetchingNextPage
      ? "正在加载更多简历"
      : `已显示 ${records.length} / ${total} 条，继续下滑加载更多`;
  }

  let listContent: ReactNode = empty;
  if (error && records.length === 0) {
    listContent = <ListLoadError error={error} onRetry={onRetry} />;
  } else if (isInitialLoading) {
    listContent = (
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-44 rounded-2xl" key={index} />
        ))}
      </div>
    );
  } else if (records.length > 0) {
    listContent = (
      <>
        {error ? <ListLoadError compact error={error} onRetry={onRetry} /> : null}
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
                <ResumeLibraryCard
                  canCreateInterview={canCreateInterview}
                  canDeleteResumeLibrary={canDeleteResumeLibrary}
                  canForceReparse={canForceReparse}
                  canRetryResumeParse={canRetryResumeParse && !retriedRecordIds.has(record.id)}
                  canUpdateResumeLibrary={canUpdateResumeLibrary}
                  currentMemberRole={currentMemberRole}
                  currentUserId={currentUserId}
                  onCopyDetailLink={onCopyDetailLink}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onForceReparse={onForceReparse}
                  onLaunchInterview={onLaunchInterview}
                  onOpenDetail={handleOpenDetail}
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
    <div className="flex flex-col gap-4" ref={listRootRef}>
      <Toolbar
        canResetFilters={grid.bind.canResetFilters}
        filterValues={grid.bind.filterValues}
        filters={filters}
        onFilterChange={grid.bind.onFilterChange}
        onRefresh={grid.bind.onRefresh}
        onResetFilters={grid.bind.onResetFilters}
        refreshing={isRefetching}
        searchLoading={isInitialLoading}
        toolbarRight={
          structuredScoreSortEnabled || canUploadResumeLibrary || canReadResumeUploadBatch ? (
            <ButtonGroup>
              {structuredScoreSortEnabled ? (
                <Button
                  onClick={onToggleStructuredScoreSort}
                  type="button"
                  variant={structuredScoreSortActive ? "secondary" : "outline"}
                >
                  <IconArrowsSort className="size-4" />
                  综合分排序
                </Button>
              ) : null}
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

      {listContent}
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
              handleOpenDetail(record);
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
