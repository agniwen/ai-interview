"use client";

import { Upload01Icon } from "@hugeicons/core-free-icons";
import { FileUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Modal } from "@/components/ui/modal";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";

interface ResumeUploadEntryDialogProps {
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSingleFilePicked: (file: File) => void;
  onMultipleFilesPicked: (files: File[]) => void;
}

function validateResumeFiles(files: File[]) {
  if (files.length === 0) {
    return false;
  }
  if (files.length > MAX_BULK_BATCH_SIZE) {
    toast.error(`最多 ${MAX_BULK_BATCH_SIZE} 份`);
    return false;
  }
  const oversize = files.find((file) => file.size > MAX_RESUME_FILE_SIZE_BYTES);
  if (oversize) {
    toast.error(`「${oversize.name}」超过 20MB`);
    return false;
  }
  const nonPdf = files.find((file) => !/\.pdf$/i.test(file.name));
  if (nonPdf) {
    toast.error(`「${nonPdf.name}」不是 PDF`);
    return false;
  }
  return true;
}

export function ResumeUploadEntryDialog({
  disabled = false,
  open,
  onMultipleFilesPicked,
  onOpenChange,
  onSingleFilePicked,
}: ResumeUploadEntryDialogProps) {
  const handledSelectionRef = useRef(false);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  useEffect(() => {
    if (open) {
      handledSelectionRef.current = false;
    }
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setUploadResetKey((key) => key + 1);
      handledSelectionRef.current = false;
    }
    onOpenChange(nextOpen);
  }

  function handleFilesAccepted(files: File[]) {
    if (handledSelectionRef.current) {
      return;
    }
    handledSelectionRef.current = true;

    const pickedFiles = [...files];
    if (pickedFiles.length === 1) {
      handleOpenChange(false);
      onSingleFilePicked(pickedFiles[0]);
      return;
    }

    handleOpenChange(false);
    onMultipleFilesPicked(pickedFiles);
  }

  return (
    <Modal
      description="选择 1 份 PDF 会创建单条简历记录；选择多份 PDF 会进入批量上传流程。"
      footer={
        <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
          取消
        </Button>
      }
      onOpenChange={handleOpenChange}
      open={open}
      size="md"
      title="上传简历"
    >
      <FileUpload
        accept="application/pdf,.pdf"
        acceptedFileTypes={[{ icon: Upload01Icon, label: "PDF" }]}
        ariaLabel="选择要上传的简历 PDF"
        browseLabel="选择 PDF"
        description={`可选择 1 份或多份 PDF；多份将进入批量上传，最多 ${MAX_BULK_BATCH_SIZE} 份。`}
        disabled={disabled}
        draggingLabel="松开上传 PDF"
        maxFiles={MAX_BULK_BATCH_SIZE}
        multiple
        onFileLimitExceeded={() => {
          toast.error(`最多 ${MAX_BULK_BATCH_SIZE} 份`);
        }}
        onFilesAccepted={handleFilesAccepted}
        onFilesSelected={validateResumeFiles}
        rejectionLabel="仅支持上传 PDF 文件"
        resetKey={uploadResetKey}
        showFileList={false}
        title="请选择 1 份或多份 PDF 简历"
      />
    </Modal>
  );
}

export function ResumeUploadEntryButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      title={disabled ? "正在上传文件" : undefined}
      type="button"
    >
      <FileUpIcon className="size-4" />
      新建简历记录
    </Button>
  );
}
