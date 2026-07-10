"use client";

import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { ResumePoolListRecord } from "@arc/shared/resume-pool";
import { useState } from "react";

export function useResumePoolPageState(initialUploadScope: ResumePoolScope) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [uploadScope, setUploadScope] = useState<ResumePoolScope>(initialUploadScope);
  const [privateUploadPolicyOpen, setPrivateUploadPolicyOpen] = useState(false);
  const [pendingPrivateUploadFiles, setPendingPrivateUploadFiles] = useState<File[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ResumePoolListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [duplicateMatchRecord, setDuplicateMatchRecord] = useState<ResumePoolListRecord | null>(
    null,
  );
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumePoolListRecord | null>(null);
  const [selectedPrivateResumeIds, setSelectedPrivateResumeIds] = useState<Set<string>>(
    () => new Set(),
  );

  return {
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
  };
}
