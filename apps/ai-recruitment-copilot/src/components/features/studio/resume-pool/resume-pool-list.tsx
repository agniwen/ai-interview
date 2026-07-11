"use client";

import { IconFileText, IconHistory, IconLoader2, IconTrash, IconUpload } from "@tabler/icons-react";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";

import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { canDeletePoolRecord } from "./resume-pool-page-model";
import { ResumePoolCard } from "./resume-pool-details";

const ResumePoolMasonry = lazy(async () => {
  const mod = await import("./resume-pool-masonry");
  return { default: mod.ResumePoolMasonry };
});

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
        <EmptyDescription>
          {canResetFilters ? "调整搜索或筛选条件后重试。" : "点击右上角上传第一份简历。"}
        </EmptyDescription>
      </EmptyHeader>
      {canResetFilters || !canUpload ? null : (
        <EmptyContent>
          <Button onClick={onUpload}>
            <IconUpload className="size-4" />
            上传简历
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
  canUpload,
  currentOrganizationId,
  currentUserId,
  deleting,
  emptyTitle,
  isInitialPoolLoading,
  isPoolBusy,
  onDelete,
  onImport,
  onOpenDuplicateMatches,
  onOpenDetail,
  onOpenPdf,
  onPublish,
  onSelectionChange,
  onUpload,
  publishing,
  records,
  selectedPrivateResumeIds,
  selectionDisabled,
  scope,
  showEmptyState,
}: {
  records: ResumePoolListRecord[];
  scope: ResumePoolScope;
  canDeletePoolRecords: boolean;
  canImportToLibrary: boolean;
  canPublishToPool: boolean;
  canUpload: boolean;
  currentOrganizationId: string | null;
  currentUserId: string | null;
  publishing: boolean;
  deleting: boolean;
  isInitialPoolLoading: boolean;
  isPoolBusy: boolean;
  showEmptyState: boolean;
  emptyTitle: string;
  canResetFilters: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenDuplicateMatches: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onSelectionChange: (record: ResumePoolListRecord, selected: boolean) => void;
  onUpload: () => void;
  selectedPrivateResumeIds: ReadonlySet<string>;
  selectionDisabled: boolean;
}) {
  if (records.length > 0) {
    const cards = records.map((record) => {
      const canDelete =
        canDeletePoolRecord(record, {
          currentOrganizationId,
          currentUserId,
        }) && canDeletePoolRecords;
      return (
        <ResumePoolCard
          canDelete={canDelete}
          canImport={canImportToLibrary}
          canPublish={canPublishToPool}
          deleting={deleting}
          key={record.id}
          onDelete={onDelete}
          onImport={onImport}
          onOpenDuplicateMatches={onOpenDuplicateMatches}
          onOpenDetail={onOpenDetail}
          onOpenPdf={onOpenPdf}
          onPublish={onPublish}
          publishing={publishing}
          record={record}
          selected={selectedPrivateResumeIds.has(record.id)}
          selectionDisabled={selectionDisabled}
          scope={scope}
          onSelectionChange={onSelectionChange}
        />
      );
    });
    const fallback = (
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{cards}</div>
    );
    return (
      <div className={isPoolBusy ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <ClientOnly fallback={fallback}>
          <Suspense fallback={fallback}>
            <ResumePoolMasonry>{cards}</ResumePoolMasonry>
          </Suspense>
        </ClientOnly>
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
  hasSelectedPrivateResumes,
  isBulkDeleting,
  isDeletingPoolRecords,
  onBulkDelete,
  onOpenBatchList,
  onUpload,
  selectedCount,
}: {
  canOpenBatchList: boolean;
  canUpload: boolean;
  hasActiveUploadBatches: boolean;
  hasSelectedPrivateResumes: boolean;
  isBulkDeleting: boolean;
  isDeletingPoolRecords: boolean;
  selectedCount: number;
  onBulkDelete: () => void;
  onOpenBatchList: () => void;
  onUpload: () => void;
}) {
  if (!canUpload && !canOpenBatchList && !hasSelectedPrivateResumes) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      {canUpload || canOpenBatchList ? (
        <ButtonGroup>
          {canUpload ? (
            <Button className="sm:w-auto" onClick={onUpload}>
              <IconUpload className="size-4" />
              上传简历
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
      {hasSelectedPrivateResumes ? (
        <Button
          disabled={isDeletingPoolRecords}
          onClick={onBulkDelete}
          type="button"
          variant="destructive"
        >
          {isBulkDeleting ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconTrash className="size-4" />
          )}
          {isBulkDeleting ? "删除中…" : `删除所选 ${selectedCount} 份`}
        </Button>
      ) : null}
    </div>
  );
}

// oxlint-disable-next-line eslint/complexity -- page-level state coordinates filters, uploads, selection, and dialogs.
