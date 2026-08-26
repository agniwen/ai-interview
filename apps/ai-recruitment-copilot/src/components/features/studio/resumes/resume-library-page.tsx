import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { RecruitingPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceMemberRole } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { buildResumeLibraryFiltersConfig } from "./resume-library-filters-config";
import { ResumeLibraryCardList } from "./resume-library-page-list";
import { ResumeLibraryPageEmptyState } from "./resume-library-page-empty-state";
import { ResumeLibraryPageOverlays } from "./resume-library-page-overlays";
import { ResumeLibraryPageShell } from "./resume-library-page-shell";
import type { SearchParamsRecord } from "./resume-library-page-model";
import { useResumeLibraryBulkUpload } from "./use-resume-library-bulk-upload";
import { useResumeLibraryPageActions } from "./use-resume-library-page-actions";
import { useResumeLibraryPageQueries } from "./use-resume-library-page-queries";
import { useResumeLibraryPageState } from "./use-resume-library-page-state";

export function ResumeLibraryPage() {
  const currentMemberRole = useWorkspaceMemberRole();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes" });
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const canCreateInterview = useHasPermission("interview", "create");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canUpdateResumeLibrary = useHasPermission("resumeLibrary", "update");
  const canDeleteResumeLibrary = useHasPermission("resumeLibrary", "delete");
  const canReadResumeUploadBatch = useHasPermission("resumeUploadBatch", "read");
  const canCreateResumeUploadBatch = useHasPermission("resumeUploadBatch", "create");
  const canRetryResumeParse = useHasPermission("resumeUploadBatch", "process");
  const canForceReparse =
    canRetryResumeParse && (currentMemberRole === "admin" || currentMemberRole === "owner");

  const {
    batchListOpen,
    bulkDeleteOpen,
    confirmOpen,
    deleteRecord,
    duplicateMatchRecord,
    editRecordId,
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

  const {
    duplicateMatchesQuery,
    forceReparseMutation,
    grid,
    invalidateAll,
    isInitialPageLoading,
    jobDescriptions,
    loadedResumeRecords,
    loadedResumeRowsById,
    metricsChartKey,
    metricsQuery,
    metricsScope,
    metricsSwitching,
    resumeLibraryListQuery,
    resumeLibraryTotal,
    retryParseMutation,
    setMetricsScope,
    skillSuggestions,
    slug,
    workspaceMembers,
  } = useResumeLibraryPageQueries({
    duplicateMatchRecord,
    // SAFETY: The route validator defines the search shape consumed by the page query hooks.
    routeSearch: routeSearch as SearchParamsRecord,
  });

  const {
    batchListQuery,
    bulk,
    canUploadResumeLibrary,
    handleOpenBatch,
    hasActiveUploadBatches,
    libraryBatches,
    uploadEntryDisabled,
  } = useResumeLibraryBulkUpload({
    canCreateResumeLibrary,
    canCreateResumeUploadBatch,
    canReadResumeUploadBatch,
    invalidateAll,
    setPendingFiles,
    setProgressOpen,
  });

  const {
    handleBulkDelete,
    handleDelete,
    handleMultipleUploadFilesPicked,
    handleSingleUploadFilePicked,
    onCopyDetailLink,
    onOpenDetail,
    onTransition,
    startAiInterview,
  } = useResumeLibraryPageActions({
    grid,
    invalidateAll,
    loadedResumeRowsById,
    // SAFETY: The route validator defines the search shape consumed by the page action hooks.
    routeSearch: routeSearch as SearchParamsRecord,
    setBulkDeleteOpen,
    setConfirmOpen,
    setDeleteRecord,
    setEditRecordId,
    setIsBulkDeleting,
    setLaunchingRecord,
    setPendingFiles,
    setTransitionTarget,
    slug,
  });

  const filtersConfig = useMemo(
    () =>
      buildResumeLibraryFiltersConfig({
        jobDescriptions,
        skillSuggestions,
        workspaceMembers,
      }),
    [skillSuggestions, jobDescriptions, workspaceMembers],
  );

  if (isInitialPageLoading) {
    return <RecruitingPageSkeleton />;
  }

  const selectedCount = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length;

  return (
    <>
      <ResumeLibraryPageShell
        metrics={metricsQuery.data}
        metricsChartKey={metricsChartKey}
        metricsError={metricsQuery.error}
        metricsFetching={metricsQuery.isFetching}
        metricsScope={metricsScope}
        metricsSwitching={metricsSwitching}
        onMetricsRetry={async () => {
          await metricsQuery.refetch();
        }}
        onMetricsScopeChange={setMetricsScope}
        slug={slug}
      >
        <ResumeLibraryCardList
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canForceReparse={canForceReparse}
          canReadResumeUploadBatch={canReadResumeUploadBatch}
          canRetryResumeParse={canRetryResumeParse}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          canUploadResumeLibrary={canUploadResumeLibrary}
          currentMemberRole={currentMemberRole}
          currentUserId={currentUserId}
          empty={
            <ResumeLibraryPageEmptyState
              canUploadResumeLibrary={canUploadResumeLibrary}
              onOpenUploadEntry={() => setUploadEntryOpen(true)}
              stageFilter={grid.filters.stage}
              uploadEntryDisabled={uploadEntryDisabled}
            />
          }
          error={resumeLibraryListQuery.error}
          fetchNextPage={async () => {
            await resumeLibraryListQuery.fetchNextPage();
          }}
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
          onCopyDetailLink={onCopyDetailLink}
          onDelete={setDeleteRecord}
          onEdit={(record) => setEditRecordId(record.id)}
          onForceReparse={forceReparseMutation.mutate}
          onLaunchInterview={startAiInterview}
          onOpenBatchList={() => setBatchListOpen(true)}
          onOpenDetail={onOpenDetail}
          onOpenUploadEntry={() => setUploadEntryOpen(true)}
          onPreviewResume={setPreviewRecord}
          onRetry={() => {
            void resumeLibraryListQuery.refetch();
          }}
          onRetryParse={retryParseMutation.mutate}
          onShowDuplicateMatches={setDuplicateMatchRecord}
          onTransition={onTransition}
          records={loadedResumeRecords}
          retryingRecordId={
            (forceReparseMutation.isPending ? forceReparseMutation.variables?.id : null) ??
            (retryParseMutation.isPending ? retryParseMutation.variables?.id : null) ??
            null
          }
          total={resumeLibraryTotal}
          uploadEntryDisabled={uploadEntryDisabled}
        />
      </ResumeLibraryPageShell>

      <ResumeLibraryPageOverlays
        batchListOpen={batchListOpen}
        batchListQuery={batchListQuery}
        bulk={bulk}
        bulkDeleteOpen={bulkDeleteOpen}
        confirmOpen={confirmOpen}
        deleteRecord={deleteRecord}
        duplicateMatchRecord={duplicateMatchRecord}
        duplicateMatchesQuery={duplicateMatchesQuery}
        editRecordId={editRecordId}
        handleBulkDelete={handleBulkDelete}
        handleDelete={handleDelete}
        handleMultipleUploadFilesPicked={handleMultipleUploadFilesPicked}
        handleOpenBatch={handleOpenBatch}
        handleSingleUploadFilePicked={handleSingleUploadFilePicked}
        invalidateAll={invalidateAll}
        interviewDetailDialogOpen={interviewDetailDialogOpen}
        interviewRoundDetailId={interviewRoundDetailId}
        isBulkDeleting={isBulkDeleting}
        launchingRecord={launchingRecord}
        libraryBatches={libraryBatches}
        onDeleteRecordChange={setDeleteRecord}
        pendingFiles={pendingFiles}
        previewRecord={previewRecord}
        progressOpen={progressOpen}
        selectedCount={selectedCount}
        setBatchListOpen={setBatchListOpen}
        setBulkDeleteOpen={setBulkDeleteOpen}
        setConfirmOpen={setConfirmOpen}
        setDuplicateMatchRecord={setDuplicateMatchRecord}
        setEditRecordId={setEditRecordId}
        setInterviewDetailDialogOpen={setInterviewDetailDialogOpen}
        setInterviewRoundDetailId={setInterviewRoundDetailId}
        setLaunchingRecord={setLaunchingRecord}
        setPendingFiles={setPendingFiles}
        setPreviewRecord={setPreviewRecord}
        setProgressOpen={setProgressOpen}
        setTransitionTarget={setTransitionTarget}
        setUploadEntryOpen={setUploadEntryOpen}
        slug={slug}
        transitionTarget={transitionTarget}
        uploadEntryDisabled={uploadEntryDisabled}
        uploadEntryOpen={uploadEntryOpen}
      />
    </>
  );
}
