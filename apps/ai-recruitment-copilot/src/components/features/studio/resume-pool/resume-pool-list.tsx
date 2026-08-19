"use client";

import { IconFileText, IconHistory, IconUserPlus } from "@tabler/icons-react";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { cn } from "@arc/shared/utils";

import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

import { canDeletePoolRecord, groupResumePoolRecordsByCreatedAt } from "./resume-pool-page-model";
import { ResumePoolCard } from "./resume-pool-details";

const ResumePoolMasonry = lazy(async () => {
  const mod = await import("./resume-pool-masonry");
  return { default: mod.ResumePoolMasonry };
});

function ignoreResumePoolSelection(_record: ResumePoolListRecord, _selected: boolean) {
  void _record;
  void _selected;
}

function ResumePoolStickyDateGroupHeader({
  headingId,
  label,
  onNavigate,
  recordCount,
}: {
  headingId: string;
  label: string;
  onNavigate: () => void;
  recordCount: number;
}) {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) {
      return;
    }

    let frameId: number | null = null;
    const syncStuckState = () => {
      if (frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const stickyTop = Number.parseFloat(window.getComputedStyle(node).top);
        const isAtStickyPosition = node.getBoundingClientRect().top <= stickyTop + 16;
        setIsStuck((current) => (current === isAtStickyPosition ? current : isAtStickyPosition));
      });
    };

    syncStuckState();
    document.addEventListener("scroll", syncStuckState, { capture: true, passive: true });
    window.addEventListener("resize", syncStuckState);
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      document.removeEventListener("scroll", syncStuckState, true);
      window.removeEventListener("resize", syncStuckState);
    };
  }, []);

  return (
    <div
      className={cn(
        "group sticky top-[calc(var(--header-height)+0.5rem)] z-10 flex w-fit items-center gap-2 rounded-r-[12px] border border-transparent px-4 py-2 transition-colors hover:border-input hover:bg-sidebar/70",
        isStuck && "border-input bg-background/80 backdrop-blur-md",
      )}
      ref={headerRef}
    >
      <h2 className="font-medium text-sm" id={headingId}>
        <button
          className={cn(
            "-mx-4 -my-2 flex items-center gap-2 px-4 py-2 text-left outline-none transition-transform",
            isStuck ? "translate-x-0" : "-translate-x-4 group-hover:translate-x-0",
          )}
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
    <output
      aria-label="正在加载简历"
      className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div className="flex min-h-56 flex-col gap-4 rounded-xl border p-5" key={index}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-14 w-full" />
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </output>
  );
}

export function ResumePoolEmptyState({
  canUpload,
  canResetFilters,
  emptyTitle,
  onUpload,
}: {
  canUpload: boolean;
  canResetFilters: boolean;
  emptyTitle: string;
  onUpload: () => void;
}) {
  return (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconFileText className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
      </EmptyHeader>
      {canResetFilters || !canUpload ? null : (
        <EmptyContent>
          <Button onClick={onUpload}>
            <IconUserPlus className="size-4" />
            新建人才记录
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

export function ResumePoolListContent({
  canDeletePoolRecords,
  canImportToLibrary,
  canResetFilters,
  canPublishToPool,
  canRetryResumeParse,
  canUpload,
  currentOrganizationId,
  currentUserId,
  deleting,
  emptyTitle,
  isInitialPoolLoading,
  onDelete,
  onImport,
  onOpenDuplicateMatches,
  onOpenDetail,
  onOpenPdf,
  onPublish,
  onRetryParse,
  onUpload,
  publishing,
  retryingRecordId,
  retriedRecordIds,
  renderCard: renderCardOverride,
  records,
  scope,
  showEmptyState,
}: {
  records: ResumePoolListRecord[];
  scope: ResumePoolScope;
  canDeletePoolRecords: boolean;
  canImportToLibrary: boolean;
  canPublishToPool: boolean;
  canRetryResumeParse: boolean;
  canUpload: boolean;
  currentOrganizationId: string | null;
  currentUserId: string | null;
  publishing: boolean;
  deleting: boolean;
  isInitialPoolLoading: boolean;
  showEmptyState: boolean;
  emptyTitle: string;
  canResetFilters: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onRetryParse: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onUpload: () => void;
  retryingRecordId: string | null;
  retriedRecordIds: ReadonlySet<string>;
  renderCard?: (record: ResumePoolListRecord) => ReactNode;
}) {
  const groupSectionRefs = useRef(new Map<string, HTMLElement>());

  if (records.length > 0) {
    const renderCard =
      renderCardOverride ??
      ((record: ResumePoolListRecord) => {
        const canDelete =
          canDeletePoolRecord(record, {
            currentOrganizationId,
            currentUserId,
          }) && canDeletePoolRecords;
        const canManageRecord = scope !== "private" || record.createdBy === currentUserId;
        return (
          <ResumePoolCard
            canDelete={canDelete}
            canImport={canImportToLibrary && canManageRecord}
            canPublish={canPublishToPool && canManageRecord}
            canRetryParse={
              canRetryResumeParse && canManageRecord && !retriedRecordIds.has(record.id)
            }
            deleting={deleting}
            key={record.id}
            onDelete={onDelete}
            onImport={onImport}
            onOpenDuplicateMatches={onOpenDuplicateMatches}
            onOpenDetail={onOpenDetail}
            onOpenPdf={onOpenPdf}
            onPublish={onPublish}
            onRetryParse={onRetryParse}
            publishing={publishing}
            retrying={retryingRecordId === record.id}
            record={record}
            selected={false}
            selectionDisabled={false}
            scope={scope}
            onSelectionChange={ignoreResumePoolSelection}
          />
        );
      });
    const groups = groupResumePoolRecordsByCreatedAt(records);
    return (
      <div className="space-y-8">
        {groups.map((group) => {
          const cards = group.records.map(renderCard);
          const fallback = (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{cards}</div>
          );
          const headingId = `resume-pool-date-group-${group.id}`;

          return (
            <section
              aria-labelledby={headingId}
              className="scroll-mt-[calc(var(--header-height)+0.5rem)] space-y-4"
              key={group.id}
              ref={(node) => {
                if (node) {
                  groupSectionRefs.current.set(group.id, node);
                } else {
                  groupSectionRefs.current.delete(group.id);
                }
              }}
            >
              <ResumePoolStickyDateGroupHeader
                headingId={headingId}
                label={group.label}
                onNavigate={() =>
                  groupSectionRefs.current
                    .get(group.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                recordCount={group.records.length}
              />
              <ClientOnly fallback={fallback}>
                <Suspense fallback={fallback}>
                  <ResumePoolMasonry>{cards}</ResumePoolMasonry>
                </Suspense>
              </ClientOnly>
            </section>
          );
        })}
      </div>
    );
  }

  if (isInitialPoolLoading) {
    return <ResumePoolLoadingState />;
  }

  if (showEmptyState) {
    return (
      <ResumePoolEmptyState
        canUpload={canUpload}
        canResetFilters={canResetFilters}
        emptyTitle={emptyTitle}
        onUpload={onUpload}
      />
    );
  }

  return null;
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
      {canUpload || canOpenBatchList ? (
        <ButtonGroup>
          {canUpload ? (
            <Button className="sm:w-auto" onClick={onUpload}>
              <IconUserPlus className="size-4" />
              新建人才记录
            </Button>
          ) : null}
          {canOpenBatchList && hasActiveUploadBatches ? (
            <Button
              aria-label="查看上传记录"
              onClick={onOpenBatchList}
              title="查看上传记录"
              type="button"
            >
              <IconHistory className="size-4" />
            </Button>
          ) : null}
        </ButtonGroup>
      ) : null}
    </div>
  );
}

// oxlint-disable-next-line eslint/complexity -- page-level state coordinates filters, uploads, selection, and dialogs.
