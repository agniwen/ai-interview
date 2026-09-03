import { toast } from "sonner";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { ResumeDuplicateMatchesDialog } from "@/components/features/resume/resume-dedup-overlay";
import { toDedupSourceFromLibraryRecord } from "@/components/features/resume/resume-dedup-source";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { BulkUploadConfirmDialog } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import type { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { StudioScrollToTopButton } from "@/components/features/studio/studio-scroll-to-top-button";
import { ResumeUploadEntryDialog } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { LaunchInterviewDialog } from "@/components/features/studio/resumes/launch-interview-dialog";
import { TransitionCandidateDialog } from "@/components/features/studio/resumes/transition-candidate-dialog";
import type { BulkResumeBatchDto } from "@app/shared/bulk-resume-upload";
import type { UseQueryResult } from "@tanstack/react-query";
import type { DedupMatchRecord } from "@/lib/client/api";
import {
  ResumeLibraryDeleteDialogs,
  ResumeLibraryPreviewDialog,
} from "./resume-library-page-dialogs";

type BulkUpload = ReturnType<typeof useBulkUpload>;

export function ResumeLibraryPageOverlays({
  batchListOpen,
  batchListQuery,
  bulk,
  bulkDeleteOpen,
  confirmOpen,
  deleteRecord,
  duplicateMatchRecord,
  duplicateMatchesQuery,
  editRecordId,
  handleBulkDelete,
  handleDelete,
  handleMultipleUploadFilesPicked,
  handleOpenBatch,
  handleSingleUploadFilePicked,
  invalidateAll,
  interviewDetailDialogOpen,
  interviewRoundDetailId,
  isBulkDeleting,
  launchingRecord,
  libraryBatches,
  onDeleteRecordChange,
  pendingFiles,
  previewRecord,
  progressOpen,
  selectedCount,
  setBatchListOpen,
  setBulkDeleteOpen,
  setConfirmOpen,
  setDuplicateMatchRecord,
  setEditRecordId,
  setInterviewDetailDialogOpen,
  setInterviewRoundDetailId,
  setLaunchingRecord,
  setPendingFiles,
  setPreviewRecord,
  setProgressOpen,
  setTransitionTarget,
  setUploadEntryOpen,
  slug,
  transitionTarget,
  uploadEntryDisabled,
  uploadEntryOpen,
}: {
  batchListOpen: boolean;
  batchListQuery: Pick<UseQueryResult<BulkResumeBatchDto[]>, "isLoading" | "refetch">;
  bulk: BulkUpload;
  bulkDeleteOpen: boolean;
  confirmOpen: boolean;
  deleteRecord: ResumeLibraryListRecord | null;
  duplicateMatchRecord: ResumeLibraryListRecord | null;
  duplicateMatchesQuery: Pick<
    UseQueryResult<{ matches: DedupMatchRecord[] }>,
    "data" | "isError" | "isLoading"
  >;
  editRecordId: string | null;
  handleBulkDelete: () => Promise<void>;
  handleDelete: (record: ResumeLibraryListRecord | null) => Promise<void>;
  handleMultipleUploadFilesPicked: (files: File[]) => void;
  handleOpenBatch: (batch: BulkResumeBatchDto) => Promise<void>;
  handleSingleUploadFilePicked: (file: File) => void;
  invalidateAll: () => void;
  interviewDetailDialogOpen: boolean;
  interviewRoundDetailId: string | null;
  isBulkDeleting: boolean;
  launchingRecord: { id: string; candidateName: string | null } | null;
  libraryBatches: BulkResumeBatchDto[];
  onDeleteRecordChange: (record: ResumeLibraryListRecord | null) => void;
  pendingFiles: File[];
  previewRecord: ResumeLibraryListRecord | null;
  progressOpen: boolean;
  selectedCount: number;
  setBatchListOpen: (open: boolean) => void;
  setBulkDeleteOpen: (open: boolean) => void;
  setConfirmOpen: (open: boolean) => void;
  setDuplicateMatchRecord: (record: ResumeLibraryListRecord | null) => void;
  setEditRecordId: (id: string | null) => void;
  setInterviewDetailDialogOpen: (open: boolean) => void;
  setInterviewRoundDetailId: (id: string | null) => void;
  setLaunchingRecord: (record: { id: string; candidateName: string | null } | null) => void;
  setPendingFiles: (files: File[] | ((prev: File[]) => File[])) => void;
  setPreviewRecord: (record: ResumeLibraryListRecord | null) => void;
  setProgressOpen: (open: boolean) => void;
  setTransitionTarget: (
    target: {
      candidate: { id: string; candidateName: string | null };
      mode: "close" | "reactivate";
      initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
    } | null,
  ) => void;
  setUploadEntryOpen: (open: boolean) => void;
  slug: string;
  transitionTarget: {
    candidate: { id: string; candidateName: string | null };
    mode: "close" | "reactivate";
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  } | null;
  uploadEntryDisabled: boolean;
  uploadEntryOpen: boolean;
}) {
  return (
    <>
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

      <StudioPersonDetailDialog
        defaultTab="overview"
        mode="interview"
        onOpenChange={setInterviewDetailDialogOpen}
        onOpenChangeComplete={(open) => {
          if (!open && !interviewDetailDialogOpen) {
            setInterviewRoundDetailId(null);
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
        onDelete={() => handleDelete(deleteRecord)}
        onDeleteRecordChange={onDeleteRecordChange}
        selectedCount={selectedCount}
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
