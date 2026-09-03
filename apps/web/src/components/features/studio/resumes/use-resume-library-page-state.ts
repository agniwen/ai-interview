import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { useState } from "react";

export function useResumeLibraryPageState() {
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
  const [interviewDetailDialogOpen, setInterviewDetailDialogOpen] = useState(false);
  const [launchingRecord, setLaunchingRecord] = useState<{
    id: string;
    candidateName: string | null;
  } | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<{
    candidate: { id: string; candidateName: string | null };
    mode: "close" | "reactivate";
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  } | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [duplicateMatchRecord, setDuplicateMatchRecord] = useState<ResumeLibraryListRecord | null>(
    null,
  );
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  return {
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
  };
}
