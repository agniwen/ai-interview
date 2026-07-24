/* oxlint-disable complexity -- page controller composes feature modules. */
"use client";

import { IconLoader2, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ResumePoolScope, ResumeUploadBatchDedupPolicy } from "@arc/db-schema/schema";
import { resumePoolScopeMeta } from "@arc/shared/resume-pool";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useDataGridState } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { ResumeDuplicateMatchesDialog } from "@/components/features/resume/resume-dedup-overlay";
import { toDedupSourceFromPoolRecord } from "@/components/features/resume/resume-dedup-source";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import { PageHeader } from "@/components/features/studio/page-header";
import { StudioScrollToTopButton } from "@/components/features/studio/studio-scroll-to-top-button";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { ResumeUploadEntryDialog } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteResumePoolItem,
  fetchResumePoolDuplicateMatches,
  fetchResumePoolItems,
  fetchResumePoolUploaders,
  publishResumePoolItem,
} from "@/lib/client/api";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { authClient } from "@/lib/client/auth-client";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceId, useWorkspaceSlug } from "@/lib/client/workspace-context";

import {
  canImportResumePoolToLibrary,
  canUploadToResumePool,
  buildResumePoolUploaderFilterOptions,
  createResumePoolFilters,
  deletePoolRecordLabel,
  filterPoolRecords,
  getCandidateTitle,
  getCandidateTitleWithId,
  getResumePoolUploaderFilterAvailability,
  normalizeScope,
  pruneSelectedPrivateResumeIds,
  removeSelectedPrivateResumeId,
  RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
  sessionUserId,
  updateSelectedPrivateResumeIds,
} from "@/components/features/studio/resume-pool/resume-pool-page-model";
import type { ResumePoolFilters } from "@/components/features/studio/resume-pool/resume-pool-page-model";
import { useResumePoolPageState } from "@/components/features/studio/resume-pool/use-resume-pool-page-state";
import {
  ImportResumePoolDialog,
  PrivateResumePoolUploadPolicyDialog,
  SelectResumePoolScopeDialog,
} from "@/components/features/studio/resume-pool/resume-pool-dialogs";
import { ResumePoolDetailDialog } from "@/components/features/studio/resume-pool/resume-pool-details";
import {
  ResumePoolListContent,
  ResumePoolToolbarActions,
} from "@/components/features/studio/resume-pool/resume-pool-list";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

export interface ResumePoolSearch {
  scope?: ResumePoolScope;
  uploaderId?: string;
}

const RESUME_POOL_INITIAL_PAGE_SIZE = 20;
const RESUME_POOL_LOAD_STEP = 20;

export function ResumePoolPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const canCreateResumePool = useHasPermission("resumePool", "create");
  const canDeleteResumePool = useHasPermission("resumePool", "delete");
  const canImportResumePool = useHasPermission("resumePool", "import");
  const canPublishResumePool = useHasPermission("resumePool", "publish");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canReadResumeUploadBatch = useHasPermission("resumeUploadBatch", "read");
  const canCreateResumeUploadBatch = useHasPermission("resumeUploadBatch", "create");
  const search = useSearch({ from: "/w/$slug/studio/resume-pool" }) as ResumePoolSearch;
  const navigate = useNavigate({ from: "/w/$slug/studio/resume-pool" });
  const scope = normalizeScope(search.scope);
  const currentUserId = sessionUserId(session);
  const currentOrganizationId = workspaceId;
  const initialPoolFilters = useMemo(
    () => createResumePoolFilters(scope, currentUserId),
    [currentUserId, scope],
  );
  const {
    batchListOpen,
    deleteTarget,
    detailRecord,
    duplicateMatchRecord,
    importTarget,
    pendingPrivateUploadFiles,
    previewRecord,
    privateUploadPolicyOpen,
    progressOpen,
    selectedPrivateResumeIds,
    setBatchListOpen,
    setDeleteTarget,
    setDetailRecord,
    setDuplicateMatchRecord,
    setImportTarget,
    setPendingPrivateUploadFiles,
    setPreviewRecord,
    setPrivateUploadPolicyOpen,
    setProgressOpen,
    setSelectedPrivateResumeIds,
    setUploadEntryOpen,
    setUploadOpen,
    setUploadScope,
    uploadEntryOpen,
    uploadOpen,
    uploadScope,
  } = useResumePoolPageState(scope);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const queryKeyPrefix = useMemo(() => ["resume-pool", slug] as const, [slug]);
  const fetcher = useMemo(
    () =>
      async (params: {
        filters: ResumePoolFilters;
        page: number;
        pageSize: number;
        search: string;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }) => {
        const result = await fetchResumePoolItems(
          slug,
          scope,
          scope === "private" ? params.filters.uploaderId || currentUserId || undefined : undefined,
        );
        const filtered = filterPoolRecords(result.records, params);
        const start = (params.page - 1) * params.pageSize;
        const records = filtered.slice(start, start + params.pageSize);
        return {
          records,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / params.pageSize)),
        };
      },
    [currentUserId, scope, slug],
  );
  const grid = useDataGridState<ResumePoolListRecord, ResumePoolFilters>({
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultPageSize: RESUME_POOL_INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: initialPoolFilters,
    maxPageSize: Number.MAX_SAFE_INTEGER,
    queryFn: fetcher,
    queryKeyBase: ["resume-pool", slug, scope],
  });
  const visibleRecordCount = grid.bind.data.length;
  const totalRecordCount = grid.bind.total;
  const isPoolBusy = grid.bind.loading || grid.bind.refetching;
  const hasMoreRecords = visibleRecordCount < totalRecordCount;
  const isInitialPoolLoading = isPoolBusy && visibleRecordCount === 0;
  const showEmptyState = !isInitialPoolLoading && grid.bind.data.length === 0;
  const showPoolFooter = visibleRecordCount > 0;
  const uploaderQuery = useQuery({
    enabled: scope === "private",
    queryFn: () => fetchResumePoolUploaders(slug),
    queryKey: ["resume-pool-uploaders", slug],
    ...RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
  });
  const uploaderFilterOptions = useMemo(
    () => buildResumePoolUploaderFilterOptions(uploaderQuery.data ?? []),
    [uploaderQuery.data],
  );
  const { disabled: uploaderFilterDisabled, disabledReason: uploaderFilterDisabledReason } =
    getResumePoolUploaderFilterAvailability({
      isFetching: uploaderQuery.isFetching,
      isSuccess: uploaderQuery.isSuccess,
      uploaders: uploaderQuery.data ?? [],
    });
  const selectedPrivateResumeIdsArray = useMemo(
    () => [...selectedPrivateResumeIds],
    [selectedPrivateResumeIds],
  );
  const visibleRecordIds = useMemo(
    () => grid.bind.data.map((record) => record.id),
    [grid.bind.data],
  );
  const hasSelectedPrivateResumes = scope === "private" && selectedPrivateResumeIdsArray.length > 0;
  const canUploadResumePool = canUploadToResumePool(
    canCreateResumePool,
    canCreateResumeUploadBatch,
  );
  const canImportToLibrary = canImportResumePoolToLibrary(
    canImportResumePool,
    canCreateResumeLibrary,
  );
  const canBulkDeletePrivateResumes = canDeleteResumePool && hasSelectedPrivateResumes;
  const loadMoreRecords = useCallback(() => {
    if (!hasMoreRecords || isPoolBusy) {
      return;
    }
    const nextPageSize = Math.min(
      totalRecordCount,
      grid.bind.pagination.pageSize + RESUME_POOL_LOAD_STEP,
    );
    grid.bind.pagination.onPageSizeChange(nextPageSize);
  }, [grid.bind.pagination, hasMoreRecords, isPoolBusy, totalRecordCount]);

  const invalidatePool = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeyPrefix });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  };

  const bulk = useBulkUpload({
    onBatchQueued: () => {
      setProgressOpen(false);
      toast.success("已加入后台解析队列");
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      invalidatePool();
    },
    onRecordsChanged: invalidatePool,
  });
  const batchListQuery = useQuery({
    enabled: canReadResumeUploadBatch,
    queryFn: () => listBulkResumeBatches(slug),
    queryKey: ["bulk-resume-batches", slug],
    refetchInterval: 10_000,
  });
  const duplicateMatchesQuery = useQuery({
    enabled: duplicateMatchRecord !== null,
    queryFn: () => fetchResumePoolDuplicateMatches(slug, duplicateMatchRecord?.id ?? ""),
    queryKey: ["resume-pool", slug, duplicateMatchRecord?.id, "duplicate-matches"],
  });
  const poolBatches = useMemo(
    () => (batchListQuery.data ?? []).filter((batch) => batch.target === "resume_pool"),
    [batchListQuery.data],
  );
  const hasActiveUploadBatches = poolBatches.some(
    (batch) => batch.status === "pending" || batch.status === "running",
  );

  useEffect(() => {
    if (hasActiveUploadBatches) {
      void queryClient.invalidateQueries({ queryKey: queryKeyPrefix });
    }
  }, [hasActiveUploadBatches, queryClient, queryKeyPrefix]);

  useEffect(() => {
    setSelectedPrivateResumeIds((current) =>
      pruneSelectedPrivateResumeIds(current, scope, visibleRecordIds),
    );
  }, [scope, setSelectedPrivateResumeIds, visibleRecordIds]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreRecords) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRecords();
        }
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreRecords, loadMoreRecords]);

  function startQueuedUpload(
    files: File[],
    targetScope: ResumePoolScope,
    dedupPolicy: ResumeUploadBatchDedupPolicy,
  ) {
    if (!canUploadResumePool) {
      return;
    }
    if (files.length === 0) {
      return;
    }
    setUploadEntryOpen(false);
    setPrivateUploadPolicyOpen(false);
    setPendingPrivateUploadFiles([]);
    setProgressOpen(true);
    void bulk.start(files, {
      dedupPolicy,
      jdMode: "none",
      jobDescriptionId: null,
      resumePoolScope: targetScope,
      target: "resume_pool",
    });
  }

  function handleQueuedUploadFilesPicked(files: File[], targetScope: ResumePoolScope) {
    if (!canUploadResumePool) {
      return;
    }
    if (files.length === 0) {
      return;
    }
    if (targetScope === "private") {
      setUploadEntryOpen(false);
      setPendingPrivateUploadFiles(files);
      setPrivateUploadPolicyOpen(true);
      return;
    }
    startQueuedUpload(files, "public", "create");
  }

  async function handleOpenBatch(batch: (typeof poolBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
  }

  function handlePrivateResumeSelection(record: ResumePoolListRecord, selected: boolean) {
    setSelectedPrivateResumeIds((current) =>
      updateSelectedPrivateResumeIds(current, record.id, selected),
    );
  }

  const publishMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => publishResumePoolItem(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "推送失败"),
    onSuccess: () => {
      toast.success("已推送到公共简历池");
      invalidatePool();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => deleteResumePoolItem(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败"),
    onSuccess: (_data, record) => {
      toast.success(`${deletePoolRecordLabel(record)}已删除`);
      setSelectedPrivateResumeIds((current) => removeSelectedPrivateResumeId(current, record.id));
      setDeleteTarget(null);
      invalidatePool();
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteResumePoolItem(slug, id)));
      return ids.length;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "批量删除失败"),
    onSettled: invalidatePool,
    onSuccess: (deletedCount) => {
      toast.success(`已删除 ${deletedCount} 份私有简历`);
      setSelectedPrivateResumeIds(new Set());
    },
  });
  const isDeletingPoolRecords = deleteMutation.isPending || bulkDeleteMutation.isPending;

  const emptyTitle = scope === "private" ? "暂无私有简历池简历" : "公共简历池暂无简历";
  const filtersConfig = useMemo(
    () => [
      ...(scope === "private"
        ? [
            {
              clearable: false,
              disabled: uploaderFilterDisabled,
              disabledReason: uploaderFilterDisabledReason,
              emptyMessage: "没有可选择的上传人",
              key: "uploaderId" as const,
              options: uploaderFilterOptions,
              placeholder: "按上传人筛选",
              required: true,
              searchPlaceholder: "搜索姓名或邮箱…",
              type: "select" as const,
            },
          ]
        : []),
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
        type: "search" as const,
      },
      {
        clearable: false,
        key: "sourceType" as const,
        options: [
          { label: "全部", value: "all" },
          { label: "内推", value: "referral" },
          { label: "非内推", value: "non_referral" },
        ],
        placeholder: "按类型筛选",
        searchPlaceholder: "搜索类型…",
        type: "select" as const,
      },
      {
        key: "parseStatus" as const,
        options: [
          { label: "待解析", value: "queued" },
          { label: "解析中", value: "processing" },
          { label: "已解析", value: "ready" },
          { label: "解析失败", value: "failed" },
          { label: "未解析", value: "unparsed" },
        ],
        placeholder: "按解析状态筛选",
        type: "select" as const,
      },
      {
        key: "importStatus" as const,
        options: [
          { label: "已入库", value: "imported" },
          { label: "未入库", value: "not_imported" },
        ],
        placeholder: "按入库状态筛选",
        type: "select" as const,
      },
    ],
    [scope, uploaderFilterDisabled, uploaderFilterDisabledReason, uploaderFilterOptions],
  );
  let loadMoreStatusText = "暂无可加载简历";
  if (hasMoreRecords) {
    loadMoreStatusText = isPoolBusy
      ? "正在加载更多简历"
      : `已显示 ${visibleRecordCount} / ${totalRecordCount} 条，继续下滑加载更多`;
  } else if (totalRecordCount > 0) {
    loadMoreStatusText = "已显示全部简历";
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader
          className="max-w-3xl"
          title="人才库"
          description="还没进入流程、或暂时归档的简历放这里；合适了再推进到招聘台。"
        />
        <Tabs
          onValueChange={(value) => void navigate({ search: { scope: normalizeScope(value) } })}
          value={scope}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="public">
              {resumePoolScopeMeta.public.label}
            </TabsTrigger>
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="private">
              {resumePoolScopeMeta.private.label}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-4">
          <Toolbar
            canResetFilters={grid.bind.canResetFilters}
            filterValues={grid.bind.filterValues}
            filters={filtersConfig}
            onFilterChange={grid.bind.onFilterChange}
            onRefresh={grid.bind.onRefresh}
            onResetFilters={grid.bind.onResetFilters}
            refreshing={grid.bind.refetching}
            searchLoading={grid.bind.loading}
            toolbarRight={
              <ResumePoolToolbarActions
                canOpenBatchList={canReadResumeUploadBatch}
                canUpload={canUploadResumePool}
                hasActiveUploadBatches={hasActiveUploadBatches}
                hasSelectedPrivateResumes={canBulkDeletePrivateResumes}
                isBulkDeleting={bulkDeleteMutation.isPending}
                isDeletingPoolRecords={isDeletingPoolRecords}
                onBulkDelete={() => bulkDeleteMutation.mutate(selectedPrivateResumeIdsArray)}
                onOpenBatchList={() => setBatchListOpen(true)}
                onUpload={() => setUploadOpen(true)}
                selectedCount={selectedPrivateResumeIdsArray.length}
              />
            }
          />
          <ResumePoolListContent
            canResetFilters={grid.bind.canResetFilters}
            canDeletePoolRecords={canDeleteResumePool}
            canImportToLibrary={canImportToLibrary}
            canPublishToPool={canPublishResumePool}
            canUpload={canUploadResumePool}
            currentOrganizationId={currentOrganizationId}
            currentUserId={currentUserId}
            deleting={isDeletingPoolRecords}
            emptyTitle={emptyTitle}
            isInitialPoolLoading={isInitialPoolLoading}
            isPoolBusy={isPoolBusy}
            onDelete={setDeleteTarget}
            onImport={setImportTarget}
            onOpenDuplicateMatches={setDuplicateMatchRecord}
            onOpenDetail={setDetailRecord}
            onOpenPdf={setPreviewRecord}
            onPublish={publishMutation.mutate}
            onSelectionChange={handlePrivateResumeSelection}
            onUpload={() => setUploadOpen(true)}
            publishing={publishMutation.isPending}
            records={grid.bind.data}
            selectedPrivateResumeIds={selectedPrivateResumeIds}
            selectionDisabled={isDeletingPoolRecords}
            scope={scope}
            showEmptyState={showEmptyState}
          />
          {showPoolFooter ? (
            <div className="flex flex-col items-center gap-3 px-2 pt-5 pb-10 text-center text-muted-foreground text-sm">
              <div ref={loadMoreRef} className="min-h-5">
                {hasMoreRecords && isPoolBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <IconLoader2 className="size-4 animate-spin" />
                    {loadMoreStatusText}
                  </span>
                ) : (
                  loadMoreStatusText
                )}
              </div>
              <Button
                className="w-full sm:w-auto"
                disabled={isPoolBusy}
                onClick={grid.bind.onRefresh}
                type="button"
                variant="outline"
              >
                <IconRefresh className={`size-4 ${isPoolBusy ? "animate-spin" : ""}`} />
                刷新公共简历池
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <SelectResumePoolScopeDialog
        defaultScope={scope}
        onSelected={(nextScope) => {
          setUploadScope(nextScope);
          setUploadEntryOpen(true);
        }}
        onOpenChange={setUploadOpen}
        open={uploadOpen}
      />
      <ResumeUploadEntryDialog
        description="选择 1 份或多份 PDF，都会进入后台解析队列。"
        fileUploadDescription="可选择 1 份或多份 PDF，上传后在后台异步解析。"
        fileUploadTitle="请选择要加入公共简历池的简历文件"
        onMultipleFilesPicked={(files) => handleQueuedUploadFilesPicked(files, uploadScope)}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={(file) => handleQueuedUploadFilesPicked([file], uploadScope)}
        open={uploadEntryOpen}
        title="上传简历"
      />
      <PrivateResumePoolUploadPolicyDialog
        fileCount={pendingPrivateUploadFiles.length}
        onConfirmed={(dedupPolicy) =>
          startQueuedUpload(pendingPrivateUploadFiles, "private", dedupPolicy)
        }
        onOpenChange={(open) => {
          setPrivateUploadPolicyOpen(open);
          if (!open) {
            setPendingPrivateUploadFiles([]);
          }
        }}
        open={privateUploadPolicyOpen}
      />
      <UploadBatchListDialog
        batches={poolBatches}
        isLoading={batchListQuery.isLoading}
        onOpenBatch={handleOpenBatch}
        onOpenChange={setBatchListOpen}
        open={batchListOpen}
      />
      <BulkUploadProgressDialog
        onAbort={() => {
          bulk.abort();
          setProgressOpen(false);
        }}
        onAfterClose={() => {
          void batchListQuery.refetch();
        }}
        onCancel={async () => {
          await bulk.cancel();
          setProgressOpen(false);
          toast.success("批次已取消");
        }}
        onOpenChange={(open) => {
          if (!open && bulk.state.phase !== "completed" && bulk.state.phase !== "cancelled") {
            bulk.abort();
          }
          setProgressOpen(open);
        }}
        onResume={async () => {
          if (bulk.state.detail) {
            await bulk.resume(bulk.state.detail.batch.id);
          }
        }}
        open={progressOpen}
        state={bulk.state}
      />
      <ImportResumePoolDialog
        item={importTarget}
        onImported={invalidatePool}
        onOpenChange={(open) => !open && setImportTarget(null)}
      />
      <ResumePoolDetailDialog
        currentUserId={currentUserId}
        onOpenDuplicateMatches={setDuplicateMatchRecord}
        onOpenChange={(open) => !open && setDetailRecord(null)}
        record={detailRecord}
        slug={slug}
      />
      <ResumeDuplicateMatchesDialog
        isError={duplicateMatchesQuery.isError}
        isLoading={duplicateMatchesQuery.isLoading}
        matches={duplicateMatchesQuery.data?.matches ?? []}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateMatchRecord(null);
          }
        }}
        open={duplicateMatchRecord !== null}
        source={duplicateMatchRecord ? toDedupSourceFromPoolRecord(duplicateMatchRecord) : null}
        title={
          duplicateMatchRecord
            ? `${getCandidateTitleWithId(duplicateMatchRecord)} 的疑似重复简历`
            : "疑似重复简历"
        }
      />
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这份{deletePoolRecordLabel(deleteTarget)}？</AlertDialogTitle>
            <AlertDialogDescription>
              这会永久删除 {deleteTarget ? getCandidateTitle(deleteTarget) : "该记录"}。
              已入库到招聘台的记录不会删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                }
              }}
              variant="destructive"
            >
              <IconTrash className="size-4" />
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {previewRecord
        ? (() => {
            const previewKind = getPreviewableResumeDocumentKind({
              fileName: previewRecord.resumeFileName,
            });
            return previewKind ? (
              <Suspense fallback={null}>
                <ResumeDocumentPreviewDialog
                  filename={previewRecord.resumeFileName ?? undefined}
                  kind={previewKind}
                  onOpenChange={(open) => !open && setPreviewRecord(null)}
                  open={previewRecord !== null}
                  url={`/api/w/${slug}/studio/resume-pool/${previewRecord.id}/resume`}
                />
              </Suspense>
            ) : null;
          })()
        : null}
      <StudioScrollToTopButton />
    </>
  );
}
