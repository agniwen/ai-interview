"use client";

import { IconFileText, IconHistory, IconUserPlus } from "@tabler/icons-react";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useElementScrollRestoration } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";

import { ResumePoolCard, useResumePoolCardHeight } from "./resume-pool-card";

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
}) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const cardHeight = useResumePoolCardHeight();
  const studioScrollEntry = useElementScrollRestoration({
    id: STUDIO_MAIN_SCROLL_RESTORATION_ID,
  });
  const getVirtualItemKey = useCallback(
    (index: number) => records[index]?.id ?? `resume-pool-placeholder-${index}`,
    [records],
  );
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is compiler-incompatible and is intentionally skipped.
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: records.length,
    estimateSize: () => cardHeight,
    getItemKey: getVirtualItemKey,
    getScrollElement: () =>
      listRootRef.current?.closest<HTMLElement>(
        '[data-scroll-restoration-id="studio-main-scroll"]',
      ) ?? null,
    initialOffset: studioScrollEntry?.scrollY,
    overscan: 6,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [cardHeight, virtualizer]);

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
          const record = records[virtualRow.index];
          if (!record) {
            return null;
          }
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
