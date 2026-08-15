"use client";

import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useState } from "react";

export function useResumePoolPageState() {
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ResumePoolListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [duplicateMatchRecord, setDuplicateMatchRecord] = useState<ResumePoolListRecord | null>(
    null,
  );
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumePoolListRecord | null>(null);

  return {
    batchListOpen,
    deleteTarget,
    detailRecord,
    duplicateMatchRecord,
    importTarget,
    previewRecord,
    progressOpen,
    setBatchListOpen,
    setDeleteTarget,
    setDetailRecord,
    setDuplicateMatchRecord,
    setImportTarget,
    setPreviewRecord,
    setProgressOpen,
    setUploadEntryOpen,
    uploadEntryOpen,
  };
}
