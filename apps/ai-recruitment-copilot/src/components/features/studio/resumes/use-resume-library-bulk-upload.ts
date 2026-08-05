import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

export function useResumeLibraryBulkUpload({
  canCreateResumeLibrary,
  canCreateResumeUploadBatch,
  canReadResumeUploadBatch,
  invalidateAll,
  setPendingFiles,
  setProgressOpen,
}: {
  canCreateResumeLibrary: boolean;
  canCreateResumeUploadBatch: boolean;
  canReadResumeUploadBatch: boolean;
  invalidateAll: () => void;
  setPendingFiles: (files: File[]) => void;
  setProgressOpen: (open: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

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
      libraryBatches.flatMap((batch) =>
        batch.status === "pending" || batch.status === "running" ? [batch.id] : [],
      ),
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

  return {
    batchListQuery,
    bulk,
    canUploadResumeLibrary,
    handleOpenBatch,
    hasActiveUploadBatches,
    libraryBatches,
    uploadEntryDisabled,
  };
}
