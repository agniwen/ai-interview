"use client";

import { IconFileText, IconHistory, IconUserPlus } from "@tabler/icons-react";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import {
  STUDIO_DATE_GROUP_ROW_HEIGHT,
  StudioDateGroupHeaderSkeleton,
  StudioStickyDateGroupHeader,
  buildStudioStickyDateHeaderPositions,
  useStudioStickyDateGroup,
} from "@/components/features/studio/studio-date-group-virtual-list";

import { ResumePoolCard, useResumePoolCardHeight } from "./resume-pool-card";
import { ResumePoolCardSkeleton } from "./resume-pool-card-skeleton";
import { buildResumePoolVirtualRows, canDeletePoolRecord } from "./resume-pool-page-model";

export function ResumePoolLoadingState({ showDateGroup = true }: { showDateGroup?: boolean }) {
  return (
    <output aria-label="正在加载简历" className="grid">
      {showDateGroup ? <StudioDateGroupHeaderSkeleton /> : null}
      {Array.from({ length: 4 }, (_, index) => (
        <ResumePoolCardSkeleton key={index} />
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
        <Button onClick={() => onResetFilters()} variant="outline">
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
  bindingJobDescriptionRecordId,
  canDeletePoolRecords,
  canEnterRecruiting,
  canRecommend,
  canRetryResumeParse,
  canResetFilters,
  canUpload,
  currentOrganizationId,
  currentUserId,
  deletingRecordId,
  emptyTitle,
  enteringRecruitingRecordId,
  isInitialPoolLoading,
  onBindJobDescription,
  onDelete,
  onEnterRecruiting,
  onOpenDetail,
  onOpenDuplicateMatches,
  onPreviewResume,
  onRetryParse,
  onResetFilters,
  onUpload,
  records,
  retryingRecordId,
  showEmptyState,
  slug,
  sortBy,
}: {
  bindingJobDescriptionRecordId: string | null;
  canDeletePoolRecords: boolean;
  canEnterRecruiting: boolean;
  canRecommend: boolean;
  canRetryResumeParse: boolean;
  canResetFilters: boolean;
  canUpload: boolean;
  currentOrganizationId: string | null;
  currentUserId: string | null;
  deletingRecordId: string | null;
  emptyTitle: string;
  enteringRecruitingRecordId: string | null;
  isInitialPoolLoading: boolean;
  onBindJobDescription: (record: ResumePoolListRecord, jobDescriptionId: string) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onEnterRecruiting: (record: ResumePoolListRecord) => void;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onPreviewResume: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
  onResetFilters: () => void;
  onUpload: () => void;
  records: ResumePoolListRecord[];
  retryingRecordId: string | null;
  showEmptyState: boolean;
  slug: string;
  sortBy: string | undefined;
}) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const cardHeight = useResumePoolCardHeight();
  const virtualRows = useMemo(() => buildResumePoolVirtualRows(records, sortBy), [records, sortBy]);
  const getVirtualRowSize = useCallback(
    (index: number) =>
      virtualRows[index]?.type === "date-header" ? STUDIO_DATE_GROUP_ROW_HEIGHT : cardHeight,
    [cardHeight, virtualRows],
  );
  const stickyHeaderPositions = useMemo(
    () => buildStudioStickyDateHeaderPositions(virtualRows, cardHeight),
    [cardHeight, virtualRows],
  );
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
  const { rangeExtractor, stickyState } = useStudioStickyDateGroup({
    getScrollElement,
    listRootRef,
    positions: stickyHeaderPositions,
  });
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

  let listContent: ReactNode = null;
  if (showEmptyState) {
    listContent = (
      <ResumePoolEmptyState
        canUpload={canUpload}
        canResetFilters={canResetFilters}
        emptyTitle={emptyTitle}
        onResetFilters={onResetFilters}
        onUpload={onUpload}
      />
    );
  } else if (records.length > 0) {
    listContent = (
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
                <StudioStickyDateGroupHeader
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
            const canDelete =
              canDeletePoolRecords &&
              canDeletePoolRecord(record, { currentOrganizationId, currentUserId });
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
                  bindingJobDescription={bindingJobDescriptionRecordId === record.id}
                  canDelete={canDelete}
                  canEnterRecruiting={canEnterRecruiting}
                  canRecommend={canRecommend}
                  canRetryParse={canRetryResumeParse}
                  deleting={deletingRecordId === record.id}
                  enteringRecruiting={enteringRecruitingRecordId === record.id}
                  onBindJobDescription={onBindJobDescription}
                  onDelete={onDelete}
                  onEnterRecruiting={onEnterRecruiting}
                  onOpenDetail={onOpenDetail}
                  onOpenDuplicateMatches={onOpenDuplicateMatches}
                  onPreviewResume={onPreviewResume}
                  onRetryParse={onRetryParse}
                  record={record}
                  retrying={retryingRecordId === record.id}
                  slug={slug}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <SkeletonReveal
      loading={isInitialPoolLoading}
      skeleton={<ResumePoolLoadingState showDateGroup={sortBy === "createdAt"} />}
    >
      {listContent}
    </SkeletonReveal>
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
