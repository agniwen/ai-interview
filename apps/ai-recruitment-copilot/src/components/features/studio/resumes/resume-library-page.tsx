/* oxlint-disable complexity -- page controller coordinates grid queries and dialogs. */
import { IconUsers } from "@tabler/icons-react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClientOnly, useRouter, useSearch } from "@tanstack/react-router";
import { buildInfiniteDataGridQueryKey } from "@/components/data-grid/query-contract";
import { parseCsvParam } from "@arc/shared/csv";
import {
  RESUME_LIBRARY_INFINITE_PAGE_SIZE,
  canDeleteResumeRecord,
  canLaunchInterviewFromResume,
} from "@arc/shared/studio-resumes";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryMetrics,
} from "@arc/shared/studio-resumes";
import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { ResumeDuplicateMatchesDialog } from "@/components/features/resume/resume-dedup-overlay";
import { toDedupSourceFromLibraryRecord } from "@/components/features/resume/resume-dedup-source";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { BulkUploadConfirmDialog } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  bulkDeleteStudioResumes,
  deleteStudioResume,
  fetchStudioResumeDuplicateMatches,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { StudioScrollToTopButton } from "@/components/features/studio/studio-scroll-to-top-button";
import {
  ResumeUploadEntryButton,
  ResumeUploadEntryDialog,
} from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { LaunchInterviewDialog } from "@/components/features/studio/resumes/launch-interview-dialog";
import { ResumeLibraryCharts } from "@/components/features/studio/resumes/resume-library-charts";
import { TransitionCandidateDialog } from "@/components/features/studio/resumes/transition-candidate-dialog";
import { Skeleton } from "@/components/ui/skeleton";

import {
  PIPELINE_STAGE_TAB_DESCRIPTIONS,
  VISIBLE_PIPELINE_STAGES,
  copyResumeDetailLink,
  firstSearchValue,
  useResumeLibrarySearchState,
} from "./resume-library-page-model";
import type { FetchParams, SearchParamsRecord, WorkspaceMember } from "./resume-library-page-model";
import { ResumeLibraryCardList } from "./resume-library-page-list";
import {
  ResumeLibraryDeleteDialogs,
  ResumeLibraryPreviewDialog,
} from "./resume-library-page-dialogs";
import { useResumeLibraryPageState } from "./use-resume-library-page-state";
export function ResumeLibraryPage({ metrics }: { metrics: ResumeLibraryMetrics }) {
  const slug = useWorkspaceSlug();
  const currentMemberRole = useWorkspaceMemberRole();
  const router = useRouter();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes" });
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const canCreateInterview = useHasPermission("interview", "create");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canUpdateResumeLibrary = useHasPermission("resumeLibrary", "update");
  const canDeleteResumeLibrary = useHasPermission("resumeLibrary", "delete");
  const canReadResumeUploadBatch = useHasPermission("resumeUploadBatch", "read");
  const canCreateResumeUploadBatch = useHasPermission("resumeUploadBatch", "create");

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
    void router.invalidate();
  }, [queryClient, router]);

  const {
    batchListOpen,
    bulkDeleteOpen,
    confirmOpen,
    deleteRecord,
    duplicateMatchRecord,
    editRecordId,
    interviewDetailDefaultTab,
    interviewDetailDialogOpen,
    interviewRoundDetailId,
    isBulkDeleting,
    launchingRecord,
    pendingFiles,
    previewRecord,
    progressOpen,
    setBatchListOpen,
    setBulkDeleteOpen,
    setConfirmOpen,
    setDeleteRecord,
    setDuplicateMatchRecord,
    setEditRecordId,
    setInterviewDetailDefaultTab,
    setInterviewDetailDialogOpen,
    setInterviewRoundDetailId,
    setIsBulkDeleting,
    setLaunchingRecord,
    setPendingFiles,
    setPreviewRecord,
    setProgressOpen,
    setTransitionTarget,
    setUploadEntryOpen,
    transitionTarget,
    uploadEntryOpen,
  } = useResumeLibraryPageState();
  const bulk = useBulkUpload({
    onBatchQueued: (detail) => {
      setProgressOpen(false);
      setPendingFiles([]);
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      toast.success(`${detail.batch.totalCount} 份简历已上传，后台正在解析`);
    },
    onRecordsChanged: invalidateAll,
  });
  const batchListQuery = useQuery({
    enabled: canReadResumeUploadBatch,
    queryFn: () => listBulkResumeBatches(slug),
    queryKey: ["bulk-resume-batches", slug],
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (batch) => batch.status === "pending" || batch.status === "running",
      )
        ? 10_000
        : false,
  });
  const libraryBatches = useMemo(
    () =>
      (batchListQuery.data ?? []).filter(
        (batch) => (batch.target ?? "resume_library") === "resume_library",
      ),
    [batchListQuery.data],
  );
  const canUploadResumeLibrary = canCreateResumeLibrary && canCreateResumeUploadBatch;
  const uploadEntryDisabled = bulk.state.phase === "uploading" || !canUploadResumeLibrary;
  const hasActiveUploadBatches = libraryBatches.some(
    (batch) => batch.status === "pending" || batch.status === "running",
  );

  const activeUploadBatchIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextActiveBatchIds = new Set(
      libraryBatches
        .filter((batch) => batch.status === "pending" || batch.status === "running")
        .map((batch) => batch.id),
    );
    const hadBatchFinish = [...activeUploadBatchIdsRef.current].some(
      (batchId) => !nextActiveBatchIds.has(batchId),
    );
    activeUploadBatchIdsRef.current = nextActiveBatchIds;
    if (hadBatchFinish) {
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    }
  }, [libraryBatches, queryClient]);

  async function handleOpenBatch(batch: (typeof libraryBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
  }

  const fetcher = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedResumeLibraryResult> =>
        fetchStudioResumes(slug, {
          creatorIds: parseCsvParam(params.filters.creatorIds),
          jobDescriptionIds: parseCsvParam(params.filters.jdIds),
          knownTotal: params.knownTotal,
          page: params.page,
          pageSize: params.pageSize,
          pipelineStages: parseCsvParam(params.filters.stage),
          search: params.search || undefined,
          skills: parseCsvParam(params.filters.skills),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        }),
    [slug],
  );

  const { data: workspaceMembersResult } = useQuery({
    queryFn: () =>
      rpcFetch<{ records: WorkspaceMember[] }>(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
  const workspaceMembers = useMemo(
    () => workspaceMembersResult?.records ?? [],
    [workspaceMembersResult],
  );

  const { data: jobDescriptions = [] } = useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as {
        records: { id: string; name: string; departmentName: string | null }[];
      };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all", slug],
    staleTime: 60_000,
  });

  const { data: skillSuggestions = [] } = useQuery({
    queryFn: async () => {
      const result = await fetchStudioResumeSkillSuggestions(slug, { limit: 100 });
      return result.records;
    },
    queryKey: ["studio-resumes", "skill-suggestions", slug],
    staleTime: 60_000,
  });

  const refreshResumeList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
  }, [queryClient, slug]);
  const grid = useResumeLibrarySearchState({
    onRefresh: refreshResumeList,
    search: routeSearch as SearchParamsRecord,
    slug,
  });
  const { setRowSelection } = grid;

  useEffect(() => {
    setRowSelection({});
  }, [slug, setRowSelection]);

  const [activeSort] = grid.sorting;
  let activeSortOrder: "asc" | "desc" | undefined;
  if (activeSort) {
    activeSortOrder = activeSort.desc ? "desc" : "asc";
  }
  const resumeLibraryListQuery = useInfiniteQuery({
    getNextPageParam: (
      lastPage: PaginatedResumeLibraryResult,
      allPages: PaginatedResumeLibraryResult[],
    ) =>
      lastPage.page < lastPage.totalPages
        ? { knownTotal: allPages[0]?.total, page: lastPage.page + 1 }
        : undefined,
    initialPageParam: { knownTotal: undefined as number | undefined, page: 1 },
    queryFn: ({ pageParam }) =>
      fetcher({
        filters: grid.filters,
        knownTotal: pageParam.knownTotal,
        page: pageParam.page,
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        search: grid.deferredSearch,
        sortBy: activeSort?.id,
        sortOrder: activeSortOrder,
      }),
    queryKey: buildInfiniteDataGridQueryKey(["studio-resumes", slug], {
      filters: grid.filters,
      search: grid.deferredSearch,
      sortBy: activeSort?.id,
      sortOrder: activeSortOrder,
    }),
    staleTime: 30_000,
  });
  const loadedResumeRecords = useMemo(
    () => resumeLibraryListQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [resumeLibraryListQuery.data?.pages],
  );
  const resumeLibraryTotal = resumeLibraryListQuery.data?.pages[0]?.total ?? 0;
  const loadedResumeRowsById = useMemo(
    () => new Map(loadedResumeRecords.map((row) => [row.id, row])),
    [loadedResumeRecords],
  );

  const duplicateMatchesQuery = useQuery({
    enabled: duplicateMatchRecord !== null,
    queryFn: () => fetchStudioResumeDuplicateMatches(slug, duplicateMatchRecord?.id ?? ""),
    queryKey: ["studio-resumes", slug, duplicateMatchRecord?.id, "duplicate-matches"],
  });

  const consumedRecordIdRef = useRef(false);
  useEffect(() => {
    if (consumedRecordIdRef.current) {
      return;
    }
    const recordIdFromUrl = firstSearchValue(routeSearch.recordId);
    if (!recordIdFromUrl) {
      return;
    }
    consumedRecordIdRef.current = true;
    setEditRecordId(recordIdFromUrl);
    const nextSearch: SearchParamsRecord = { ...routeSearch };
    delete nextSearch.recordId;
    void router.navigate({
      params: { slug },
      replace: true,
      search: nextSearch,
      to: "/w/$slug/studio/resumes",
    });
  }, [routeSearch, router, setEditRecordId, slug]);

  function handleSingleUploadFilePicked(file: File) {
    setPendingFiles([file]);
    setConfirmOpen(true);
  }

  function handleMultipleUploadFilesPicked(files: File[]) {
    setPendingFiles(files);
    setConfirmOpen(true);
  }

  function startAiInterview(record: ResumeLibraryListRecord) {
    if (!canLaunchInterviewFromResume(record.resumeParseStatus)) {
      toast.error("简历解析完成后才能发起 AI 面试");
      return;
    }
    setLaunchingRecord({ candidateName: record.candidateName ?? null, id: record.id });
  }

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
        type: "search" as const,
      },
      {
        emptyMessage: "没有匹配的创建人",
        key: "creatorIds" as const,
        options: workspaceMembers.map((member) => ({
          avatarUrl: member.image,
          label: member.name,
          searchValue: `${member.name} ${member.email}`,
          value: member.id,
        })),
        placeholder: "按创建人筛选",
        searchPlaceholder: "搜索姓名或邮箱…",
        selectedFormat: (count: number) => `已选 ${count} 个创建人`,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "没有匹配的技能",
        key: "skills" as const,
        options: skillSuggestions.map((item) => ({
          description: `${item.count} 位候选人`,
          label: item.skill,
          value: item.skill,
        })),
        placeholder: "按技能筛选（需同时具备）",
        searchPlaceholder: "搜索技能…",
        selectedFormat: (count: number) => `已选 ${count} 个技能（同时具备）`,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "没有匹配的岗位",
        key: "jdIds" as const,
        options: jobDescriptions.map((jd) => ({
          label: jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name,
          value: jd.id,
        })),
        placeholder: "按关联岗位筛选",
        searchPlaceholder: "搜索岗位或部门…",
        selectedFormat: (count: number) => `已选 ${count} 个岗位`,
        type: "multi-select" as const,
      },
    ],
    [skillSuggestions, jobDescriptions, workspaceMembers],
  );

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    if (!canDeleteResumeRecord(deleteRecord.resumeParseStatus)) {
      toast.error("简历解析中，暂不能删除");
      return;
    }
    try {
      await deleteStudioResume(slug, deleteRecord.id);
      setDeleteRecord(null);
      toast.success("简历已删除");
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleBulkDelete() {
    const selectedIds = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    const locked = selectedIds.some((id) => {
      const row = loadedResumeRowsById.get(id);
      return row ? !canDeleteResumeRecord(row.resumeParseStatus) : false;
    });
    if (locked) {
      toast.error("所选记录包含解析中的简历，暂不能删除");
      return;
    }
    const ids = selectedIds;
    if (ids.length === 0) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      const result = await bulkDeleteStudioResumes(slug, ids);
      toast.success(`已删除 ${result.deleted ?? ids.length} 条记录`);
      grid.setRowSelection({});
      setBulkDeleteOpen(false);
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  const resumeLibraryEmptyState = grid.filters.stage ? (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>
          暂无处于「
          {pipelineStageMeta[grid.filters.stage as PipelineStage]?.label ?? grid.filters.stage}
          」阶段的候选人
        </EmptyTitle>
        <EmptyDescription>切换到其他阶段或「全部」查看更多候选人。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>招聘台还没有任何候选人</EmptyTitle>
        <EmptyDescription>点击右上角「上传简历」加入第一份候选人简历。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canUploadResumeLibrary ? (
          <ResumeUploadEntryButton
            disabled={uploadEntryDisabled}
            onClick={() => setUploadEntryOpen(true)}
          />
        ) : null}
      </EmptyContent>
    </Empty>
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader
          title="招聘台"
          description="已经进入招聘流程的候选人在这里跟进：看简历、匹配岗位、推进到面试。"
        />
        <ClientOnly fallback={<Skeleton className="h-48 w-full" />}>
          <ResumeLibraryCharts metrics={metrics} />
        </ClientOnly>
        <Tabs
          onValueChange={(value) => {
            setRowSelection({});
            grid.setFilter("stage", value === "all" ? "" : value);
          }}
          value={grid.filters.stage || "all"}
        >
          <TabsList className="grid w-full  grid-cols-2 h-auto items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger
              className=" w-full flex-col items-start gap-0.5 px-3  sm:w-auto sm:px-8 py-1.5 h-12!"
              value="all"
            >
              <span className="text-sm leading-tight">全部</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {PIPELINE_STAGE_TAB_DESCRIPTIONS.all}
              </span>
            </TabsTrigger>
            {VISIBLE_PIPELINE_STAGES.map((s) => (
              <TabsTrigger
                className=" w-full flex-col items-start gap-0.5 px-3 sm:w-auto sm:px-8 py-1.5 h-12!"
                key={s}
                value={s}
              >
                <span className="text-sm leading-tight">{pipelineStageMeta[s].label}</span>
                <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                  {PIPELINE_STAGE_TAB_DESCRIPTIONS[s]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ResumeLibraryCardList
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canReadResumeUploadBatch={canReadResumeUploadBatch}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          canUploadResumeLibrary={canUploadResumeLibrary}
          currentMemberRole={currentMemberRole}
          currentUserId={currentUserId}
          empty={resumeLibraryEmptyState}
          fetchNextPage={resumeLibraryListQuery.fetchNextPage}
          filters={filtersConfig}
          grid={grid}
          hasActiveUploadBatches={hasActiveUploadBatches}
          hasNextPage={Boolean(resumeLibraryListQuery.hasNextPage)}
          isFetchingNextPage={resumeLibraryListQuery.isFetchingNextPage}
          isInitialLoading={resumeLibraryListQuery.isLoading}
          isRefetching={
            resumeLibraryListQuery.isRefetching && !resumeLibraryListQuery.isFetchingNextPage
          }
          onBulkDelete={() => setBulkDeleteOpen(true)}
          onCopyDetailLink={(record) => void copyResumeDetailLink(slug, record)}
          onDelete={setDeleteRecord}
          onEdit={(record) => setEditRecordId(record.id)}
          onLaunchInterview={startAiInterview}
          onOpenBatchList={() => setBatchListOpen(true)}
          onOpenDetail={(record, tab = "overview") => {
            void router.navigate({
              params: { recordId: record.id, slug },
              resetScroll: true,
              search: {
                ...routeSearch,
                tab: tab === "overview" ? undefined : tab,
              },
              state: (prev: Record<string, unknown>) => ({
                ...prev,
                fromRecruiterResumeList: true,
              }),
              to: "/w/$slug/studio/resumes/$recordId",
            } as never);
          }}
          onOpenUploadEntry={() => setUploadEntryOpen(true)}
          onPreviewResume={setPreviewRecord}
          onShowDuplicateMatches={setDuplicateMatchRecord}
          onTransition={(record, mode) =>
            setTransitionTarget({
              candidate: { candidateName: record.candidateName, id: record.id },
              mode,
            })
          }
          records={loadedResumeRecords}
          total={resumeLibraryTotal}
          uploadEntryDisabled={uploadEntryDisabled}
        />
        {/* DataGrid table preserved while the resume library moves to a card list.
        <DataGrid<ResumeLibraryListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          toolbarRight={...}
          bulkActions={...}
          empty={resumeLibraryEmptyState}
        />
        */}
      </div>

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
        source={duplicateMatchRecord ? toDedupSourceFromLibraryRecord(duplicateMatchRecord) : null}
        title={
          duplicateMatchRecord
            ? `${formatResumeCandidateTitle(
                duplicateMatchRecord.candidateName,
                duplicateMatchRecord.id,
              )} 的疑似重复简历`
            : "疑似重复简历"
        }
      />

      {/* 「保存并发起面试」/「发起 AI 面试」成功后弹出的 AI 面试详情弹窗。
          recordId 在 interview 模式下即 round id。
          AI interview detail dialog opened after save-and-start *or* the
          launch-interview flow from the resume library row menu. recordId is
          the round id when mode="interview". */}
      <StudioPersonDetailDialog
        defaultTab={interviewDetailDefaultTab}
        mode="interview"
        onOpenChange={setInterviewDetailDialogOpen}
        onOpenChangeComplete={(open) => {
          if (!open && !interviewDetailDialogOpen) {
            setInterviewRoundDetailId(null);
            setInterviewDetailDefaultTab("overview");
          }
        }}
        onUpdated={invalidateAll}
        open={interviewDetailDialogOpen}
        recordId={interviewRoundDetailId}
      />

      <LaunchInterviewDialog
        candidateName={launchingRecord?.candidateName ?? null}
        onLaunched={(round) => {
          invalidateAll();
          setInterviewDetailDefaultTab("overview");
          setInterviewRoundDetailId(round.id);
          setInterviewDetailDialogOpen(true);
        }}
        onOpenChange={(open) => !open && setLaunchingRecord(null)}
        open={launchingRecord !== null}
        recordId={launchingRecord?.id ?? null}
      />

      <TransitionCandidateDialog
        candidate={transitionTarget?.candidate ?? null}
        initialOutcome={transitionTarget?.initialOutcome}
        mode={transitionTarget?.mode ?? "close"}
        onCompleted={invalidateAll}
        onOpenChange={(open) => !open && setTransitionTarget(null)}
        open={transitionTarget !== null}
      />

      {/* StudioPersonEditDialog.onUpdated 需要接收最新记录，此处忽略参数仅刷新列表。
          StudioPersonEditDialog.onUpdated receives the updated record; we discard it and just invalidate. */}
      <StudioPersonEditDialog
        mode="resume"
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={() => invalidateAll()}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <ResumeLibraryDeleteDialogs
        bulkDeleteOpen={bulkDeleteOpen}
        deleteRecord={deleteRecord}
        isBulkDeleting={isBulkDeleting}
        onBulkDelete={handleBulkDelete}
        onBulkOpenChange={setBulkDeleteOpen}
        onDelete={handleDelete}
        onDeleteRecordChange={setDeleteRecord}
        selectedCount={Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length}
      />
      <ResumeLibraryPreviewDialog
        onClose={() => setPreviewRecord(null)}
        record={previewRecord}
        slug={slug}
      />

      <ResumeUploadEntryDialog
        disabled={uploadEntryDisabled}
        onMultipleFilesPicked={handleMultipleUploadFilesPicked}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={handleSingleUploadFilePicked}
        open={uploadEntryOpen}
      />

      <BulkUploadConfirmDialog
        files={pendingFiles}
        onConfirmed={async (files, config: BulkUploadConfirmConfig) => {
          setConfirmOpen(false);
          setProgressOpen(true);
          setPendingFiles([]);
          await bulk.start(files, config);
        }}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setPendingFiles([]);
          }
        }}
        onRemoveFile={(idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
        open={confirmOpen}
      />

      <UploadBatchListDialog
        batches={libraryBatches}
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
          if (!open) {
            if (bulk.state.phase !== "completed" && bulk.state.phase !== "cancelled") {
              bulk.abort();
            }
            setProgressOpen(false);
          }
        }}
        onResume={async () => {
          if (bulk.state.detail) {
            await bulk.resume(bulk.state.detail.batch.id);
          }
        }}
        open={progressOpen}
        state={bulk.state}
      />
      <StudioScrollToTopButton />
    </>
  );
}
