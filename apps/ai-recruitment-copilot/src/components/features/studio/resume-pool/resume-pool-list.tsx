"use client";

import { IconFileText, IconHistory, IconLoader2, IconTrash, IconUpload } from "@tabler/icons-react";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";

import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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

// oxlint-disable-next-line sort-keys -- Breakpoints are easier to audit in ascending viewport order.
const RESUME_POOL_MASONRY_COLUMNS = {
  0: 1,
  1024: 2,
  1280: 3,
  1440: 4,
} as const;

export function ResumePoolLoadingState() {
  return (
    <div className="flex min-h-56 items-center justify-center text-muted-foreground text-sm">
      <span className="inline-flex items-center gap-2">
        <IconLoader2 className="size-4 animate-spin" />
        正在加载简历
      </span>
    </div>
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
    return (
      <div className={isPoolBusy ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <ResponsiveMasonry columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}>
          <Masonry gutter="16px">
            {records.map((record) => {
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
            })}
          </Masonry>
        </ResponsiveMasonry>
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
