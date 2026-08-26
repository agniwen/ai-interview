/* oxlint-disable complexity -- page controller coordinates filters, incremental loading, uploads, and route navigation. */
"use client";

import { IconLoader2, IconRefresh, IconTrash } from "@tabler/icons-react";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useDataGridState } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { ResumeDuplicateMatchesDialog } from "@/components/features/resume/resume-dedup-overlay";
import { toDedupSourceFromPoolRecord } from "@/components/features/resume/resume-dedup-source";
import { ResumeDocumentPreviewModal } from "@/components/features/resume/resume-document-preview-modal";
import { PageHeader } from "@/components/features/studio/page-header";
import { StudioScrollToTopButton } from "@/components/features/studio/studio-scroll-to-top-button";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { ResumeUploadEntryDialog } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { Button } from "@/components/ui/button";
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
import { useHasPermission } from "@/hooks/use-has-permission";
import {
  bindResumePoolItem,
  deleteResumePoolItem,
  fetchResumePoolDuplicateMatches,
  fetchResumePoolItems,
  fetchResumePoolUploaders,
  retryResumePoolItemParse,
} from "@/lib/client/api";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { bulkResumeBatchRefetchInterval } from "@/lib/client/bulk-resume-batch-query";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceId, useWorkspaceSlug } from "@/lib/client/workspace-context";

import { ResumePoolCreatedAtFilter } from "./resume-pool-created-at-filter";
import { ImportResumePoolDialog } from "./resume-pool-dialogs";
import { ResumePoolListContent, ResumePoolToolbarActions } from "./resume-pool-list";
import {
  RESUME_POOL_LOAD_MORE_ROOT_MARGIN,
  RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
  buildResumePoolUploaderFilterOptions,
  canImportResumePoolToLibrary,
  canUploadToResumePool,
  createResumePoolFilters,
  deletePoolRecordLabel,
  getCandidateTitle,
  getCandidateTitleWithId,
  resumePoolCreatedAtBounds,
  sessionUserId,
} from "./resume-pool-page-model";
import type { ResumePoolFilters } from "./resume-pool-page-model";

const resumePoolDetailRouteApi = getRouteApi("/w/$slug/studio/resume-pool/overlay/$recordId");
const recruiterDetailRouteApi = getRouteApi("/w/$slug/studio/resumes/overlay/$recordId");
const RESUME_POOL_INITIAL_PAGE_SIZE = 60;

export function ResumePoolPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const navigatePoolDetail = resumePoolDetailRouteApi.useNavigate();
  const navigateRecruiterDetail = recruiterDetailRouteApi.useNavigate();
  const canCreateResumePool = useHasPermission("resumePool", "create");
  const canDeleteResumePool = useHasPermission("resumePool", "delete");
  const canImportResumePool = useHasPermission("resumePool", "import");
  const canReadJobDescriptions = useHasPermission("jd", "read");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canReadResumeUploadBatch = useHasPermission("resumeUploadBatch", "read");
  const canCreateResumeUploadBatch = useHasPermission("resumeUploadBatch", "create");
  const canRetryResumeParse = useHasPermission("resumeUploadBatch", "process");
  const scope = "public" as const;
  const currentUserId = sessionUserId(session);
  const initialPoolFilters = useMemo(() => createResumePoolFilters(), []);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const shouldResetInitialPageRef = useRef(true);
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumePoolListRecord | null>(null);
  const [duplicateMatchRecord, setDuplicateMatchRecord] = useState<ResumePoolListRecord | null>(
    null,
  );
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [enteringRecruitingRecordId, setEnteringRecruitingRecordId] = useState<string | null>(null);
  const [loadedPoolResult, setLoadedPoolResult] = useState<{
    records: ResumePoolListRecord[];
    signature: string;
  }>({ records: [], signature: "" });
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
        const createdAtBounds = resumePoolCreatedAtBounds(params.filters.createdAtRange);
        const result = await fetchResumePoolItems(slug, scope, {
          createdFrom: createdAtBounds?.from,
          createdTo: createdAtBounds?.to,
          importStatus:
            params.filters.importStatus === "imported" ||
            params.filters.importStatus === "not_imported"
              ? params.filters.importStatus
              : undefined,
          limit: params.pageSize,
          offset: (params.page - 1) * params.pageSize,
          search: params.search.trim() || undefined,
          sortBy:
            params.sortBy === "candidateName" ||
            params.sortBy === "createdAt" ||
            params.sortBy === "updatedAt"
              ? params.sortBy
              : undefined,
          sortOrder: params.sortOrder,
          sourceType: params.filters.sourceType,
          uploaderIds: params.filters.uploaderIds || undefined,
        });
        return {
          records: result.records,
          total: result.total,
          totalPages: Math.max(1, Math.ceil(result.total / params.pageSize)),
        };
      },
    [slug],
  );
  const grid = useDataGridState<ResumePoolListRecord, ResumePoolFilters>({
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultPageSize: RESUME_POOL_INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: initialPoolFilters,
    maxPageSize: 100,
    queryFn: fetcher,
    queryKeyBase: ["resume-pool", slug, scope],
  });

  useEffect(() => {
    if (!shouldResetInitialPageRef.current) {
      return;
    }
    shouldResetInitialPageRef.current = false;
    if (grid.bind.pagination.page > 1) {
      grid.bind.pagination.onPageChange(1);
    }
  }, [grid.bind.pagination]);

  const poolQuerySignature = JSON.stringify({
    filters: grid.bind.filterValues,
    search: grid.bind.filterValues.search.trim(),
    sortBy: grid.bind.sorting[0]?.id ?? "createdAt",
    sortOrder: grid.bind.sorting[0]?.desc === false ? "asc" : "desc",
  });

  useEffect(() => {
    if (grid.bind.loading || grid.bind.refetching) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- accumulate externally fetched pages for the virtual list
    setLoadedPoolResult((current) => {
      if (grid.bind.pagination.page === 1 || current.signature !== poolQuerySignature) {
        return { records: grid.bind.data, signature: poolQuerySignature };
      }
      const records = [...current.records];
      const start = (grid.bind.pagination.page - 1) * grid.bind.pagination.pageSize;
      records.splice(start, grid.bind.pagination.pageSize, ...grid.bind.data);
      return {
        records: records.slice(0, grid.bind.total),
        signature: poolQuerySignature,
      };
    });
  }, [
    grid.bind.data,
    grid.bind.loading,
    grid.bind.pagination.page,
    grid.bind.pagination.pageSize,
    grid.bind.refetching,
    grid.bind.total,
    poolQuerySignature,
  ]);

  const loadedPoolRecords =
    loadedPoolResult.signature === poolQuerySignature ? loadedPoolResult.records : [];
  const visibleRecordCount = loadedPoolRecords.length;
  const totalRecordCount = grid.bind.total;
  const isPoolBusy = grid.bind.loading || grid.bind.refetching;
  const hasMoreRecords = visibleRecordCount < totalRecordCount;
  const isInitialPoolLoading = isPoolBusy && visibleRecordCount === 0;
  const showEmptyState = !isInitialPoolLoading && loadedPoolRecords.length === 0;
  const canUploadResumePool = canUploadToResumePool(
    canCreateResumePool,
    canCreateResumeUploadBatch,
  );
  const canImportToLibrary = canImportResumePoolToLibrary(
    canImportResumePool,
    canCreateResumeLibrary,
  );
  const loadMoreRecords = useCallback(() => {
    if (!hasMoreRecords || isPoolBusy) {
      return;
    }
    grid.bind.pagination.onPageChange(grid.bind.pagination.page + 1);
  }, [grid.bind.pagination, hasMoreRecords, isPoolBusy]);

  const invalidatePool = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeyPrefix });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }, [queryClient, queryKeyPrefix]);
  const refreshPool = useCallback(() => {
    grid.bind.pagination.onPageChange(1);
    invalidatePool();
  }, [grid.bind.pagination, invalidatePool]);

  const bulk = useBulkUpload({
    onBatchQueued: () => {
      setProgressOpen(false);
      toast.success("已加入后台解析队列");
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      invalidatePool();
    },
    onRecordsChanged: refreshPool,
  });
  const batchListQuery = useQuery({
    enabled: canReadResumeUploadBatch,
    queryFn: () => listBulkResumeBatches(slug),
    queryKey: ["bulk-resume-batches", slug],
    refetchInterval: (query) => bulkResumeBatchRefetchInterval(query.state.data),
  });
  const uploadersQuery = useQuery({
    queryFn: () => fetchResumePoolUploaders(slug),
    queryKey: ["resume-pool-uploaders", slug],
    ...RESUME_POOL_UPLOADER_QUERY_FRESHNESS,
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
      { rootMargin: RESUME_POOL_LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreRecords, loadMoreRecords]);

  function startQueuedUpload(files: File[]) {
    if (!canUploadResumePool || files.length === 0) {
      return;
    }
    setUploadEntryOpen(false);
    setProgressOpen(true);
    void bulk.start(files, {
      dedupPolicy: "create",
      jdMode: "none",
      jobDescriptionId: null,
      resumePoolScope: scope,
      target: "resume_pool",
    });
  }

  async function handleOpenBatch(batch: (typeof poolBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
  }

  function openPoolDetail(record: ResumePoolListRecord) {
    void navigatePoolDetail({
      params: { recordId: record.id, slug },
      resetScroll: false,
      state: (previous) => ({ ...previous, fromResumePoolList: true }),
      to: "/w/$slug/studio/resume-pool/overlay/$recordId",
    });
  }

  async function enterRecruiting(record: ResumePoolListRecord) {
    if (!record.importedResumeRecordId) {
      setImportTarget(record);
      return;
    }
    setEnteringRecruitingRecordId(record.id);
    try {
      await navigateRecruiterDetail({
        params: { recordId: record.importedResumeRecordId, slug },
        resetScroll: false,
        state: (previous) => ({ ...previous, fromResumePoolList: true }),
        to: "/w/$slug/studio/resumes/overlay/$recordId",
      });
    } finally {
      setEnteringRecruitingRecordId(null);
    }
  }

  const bindJobDescriptionMutation = useMutation({
    mutationFn: ({
      jobDescriptionId,
      record,
    }: {
      jobDescriptionId: string;
      record: ResumePoolListRecord;
    }) => bindResumePoolItem(slug, record.id, jobDescriptionId),
    onError: (error) => toast.error(error instanceof Error ? error.message : "更换绑定岗位失败"),
    onSuccess: (_detail, variables) => {
      toast.success(variables.record.jobDescriptionId ? "已更换绑定岗位" : "已绑定推荐岗位");
      refreshPool();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => deleteResumePoolItem(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败"),
    onSuccess: (_data, record) => {
      toast.success(`${deletePoolRecordLabel(record)}已删除`);
      setDeleteTarget(null);
      refreshPool();
    },
  });
  const retryParseMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => retryResumePoolItemParse(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "重新解析简历失败"),
    onSuccess: () => {
      toast.success("已重新加入解析队列");
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      refreshPool();
    },
  });

  const emptyTitle = grid.bind.filterValues.createdAtRange
    ? "当前时间范围内暂无人才"
    : "公共简历池暂无简历";
  const uploaderFilterOptions = useMemo(
    () => buildResumePoolUploaderFilterOptions(uploadersQuery.data ?? []),
    [uploadersQuery.data],
  );
  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、公司、学校、邮箱、电话、简历名或目标岗位",
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
        emptyMessage: uploadersQuery.isFetching ? "正在加载上传用户…" : "没有可选择的上传用户",
        key: "uploaderIds" as const,
        options: uploaderFilterOptions,
        placeholder: "上传人 / 内推人",
        searchPlaceholder: "搜索上传人 / 内推人…",
        selectedFormat: (count: number) => `已选 ${count} 位人员`,
        type: "multi-select" as const,
      },
      {
        key: "importStatus" as const,
        options: [
          { label: "已进入招聘", value: "imported" },
          { label: "未进入招聘", value: "not_imported" },
        ],
        placeholder: "按招聘状态筛选",
        type: "select" as const,
      },
      {
        key: "createdAtRange" as const,
        render: (
          <ResumePoolCreatedAtFilter
            onValueChange={(value) => grid.bind.onFilterChange("createdAtRange", value)}
            value={grid.bind.filterValues.createdAtRange}
          />
        ),
        type: "custom" as const,
      },
    ],
    [grid.bind, uploaderFilterOptions, uploadersQuery.isFetching],
  );
  let loadMoreStatusText = "暂无可加载简历";
  if (hasMoreRecords) {
    loadMoreStatusText = isPoolBusy
      ? "正在加载更多人才"
      : `已显示 ${visibleRecordCount} / ${totalRecordCount} 条，继续下滑加载更多`;
  } else if (totalRecordCount > 0) {
    loadMoreStatusText = "已显示全部人才";
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <PageHeader
          className="max-w-3xl"
          description="推进到招聘台后进入招聘流程。"
          title="人才库"
        />
        <div className="flex flex-col gap-4">
          <Toolbar
            canResetFilters={grid.bind.canResetFilters}
            filterValues={grid.bind.filterValues}
            filters={filtersConfig}
            onFilterChange={grid.bind.onFilterChange}
            onRefresh={refreshPool}
            onResetFilters={grid.bind.onResetFilters}
            refreshing={grid.bind.refetching}
            searchLoading={grid.bind.loading}
            toolbarRight={
              <ResumePoolToolbarActions
                canOpenBatchList={canReadResumeUploadBatch}
                canUpload={canUploadResumePool}
                hasActiveUploadBatches={hasActiveUploadBatches}
                onOpenBatchList={() => setBatchListOpen(true)}
                onUpload={() => setUploadEntryOpen(true)}
              />
            }
          />
          <ResumePoolListContent
            bindingJobDescriptionRecordId={
              bindJobDescriptionMutation.isPending
                ? (bindJobDescriptionMutation.variables?.record.id ?? null)
                : null
            }
            canDeletePoolRecords={canDeleteResumePool}
            canEnterRecruiting={canImportToLibrary}
            canRecommend={canImportResumePool && canReadJobDescriptions}
            canRetryResumeParse={canRetryResumeParse}
            canResetFilters={grid.bind.canResetFilters}
            canUpload={canUploadResumePool}
            currentOrganizationId={workspaceId}
            currentUserId={currentUserId}
            deletingRecordId={
              deleteMutation.isPending ? (deleteMutation.variables?.id ?? null) : null
            }
            emptyTitle={emptyTitle}
            enteringRecruitingRecordId={enteringRecruitingRecordId}
            isInitialPoolLoading={isInitialPoolLoading}
            onBindJobDescription={(record, jobDescriptionId) => {
              bindJobDescriptionMutation.mutate({ jobDescriptionId, record });
            }}
            onDelete={setDeleteTarget}
            onEnterRecruiting={enterRecruiting}
            onOpenDetail={openPoolDetail}
            onOpenDuplicateMatches={setDuplicateMatchRecord}
            onPreviewResume={setPreviewRecord}
            onRetryParse={retryParseMutation.mutate}
            onResetFilters={grid.bind.onResetFilters}
            onUpload={() => setUploadEntryOpen(true)}
            records={loadedPoolRecords}
            retryingRecordId={
              retryParseMutation.isPending ? (retryParseMutation.variables?.id ?? null) : null
            }
            showEmptyState={showEmptyState}
            slug={slug}
            sortBy={grid.bind.sorting[0]?.id ?? "createdAt"}
          />
          {visibleRecordCount > 0 ? (
            <div className="flex flex-col items-center gap-3 px-2 pt-2 pb-10 text-center text-muted-foreground text-sm">
              <div className="min-h-5" ref={loadMoreRef}>
                {hasMoreRecords && isPoolBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <IconLoader2 className="animate-spin" />
                    {loadMoreStatusText}
                  </span>
                ) : (
                  loadMoreStatusText
                )}
              </div>
              <Button
                className="w-full sm:w-auto"
                disabled={isPoolBusy}
                onClick={refreshPool}
                type="button"
                variant="outline"
              >
                <IconRefresh
                  className={isPoolBusy ? "animate-spin" : undefined}
                  data-icon="inline-start"
                />
                刷新人才库
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <ResumeUploadEntryDialog
        description="支持同时上传多份 PDF。"
        fileUploadDescription="支持同时上传多份 PDF。"
        fileUploadTitle="请选择要上传到人才库的简历文件"
        onMultipleFilesPicked={startQueuedUpload}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={(file) => startQueuedUpload([file])}
        open={uploadEntryOpen}
        title="上传到人才库"
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
      <ResumeDocumentPreviewModal
        fileName={previewRecord?.resumeFileName}
        onClose={() => setPreviewRecord(null)}
        url={
          previewRecord?.resumeStorageKey
            ? `/api/w/${slug}/studio/resume-pool/${previewRecord.id}/resume`
            : null
        }
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这份{deletePoolRecordLabel(deleteTarget)}？</AlertDialogTitle>
            <AlertDialogDescription>
              这会永久删除 {deleteTarget ? getCandidateTitle(deleteTarget) : "该记录"}。
              已进入招聘台的记录不会被删除。
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
      <StudioScrollToTopButton />
    </>
  );
}
