"use client";

import { IconFileUpload, IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Modal } from "@/components/ui/modal";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import {
  isSupportedResumeDocumentInput,
  supportedResumeDocumentAccept,
  supportedResumeDocumentLabel,
} from "@arc/shared/resume-documents";

interface ResumeUploadEntryDialogProps {
  disabled?: boolean;
  description?: string;
  fileUploadDescription?: string;
  fileUploadTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSingleFilePicked: (file: File) => void;
  onMultipleFilesPicked: (files: File[]) => void;
  title?: string;
}

const DEFAULT_DESCRIPTION = `选择 1 份或多份简历都会进入后台上传任务。支持 ${supportedResumeDocumentLabel}。`;
const DEFAULT_FILE_UPLOAD_DESCRIPTION = `可选择 1 份或多份简历文件；上传后将在后台解析入库，最多 ${MAX_BULK_BATCH_SIZE} 份。`;

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
  const unsupported = files.find(
    (file) => !isSupportedResumeDocumentInput({ fileName: file.name, mediaType: file.type }),
  );
  if (unsupported) {
    toast.error(`「${unsupported.name}」不是支持的简历格式`);
    return false;
  }
  return true;
}

export function ResumeUploadEntryDialog({
  disabled = false,
  description = DEFAULT_DESCRIPTION,
  fileUploadDescription = DEFAULT_FILE_UPLOAD_DESCRIPTION,
  fileUploadTitle = "请选择 1 份或多份简历文件",
  open,
  onMultipleFilesPicked,
  onOpenChange,
  onSingleFilePicked,
  title = "上传简历",
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
      description={description}
      footer={
        <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
          取消
        </Button>
      }
      onOpenChange={handleOpenChange}
      open={open}
      size="md"
      title={title}
    >
      <FileUpload
        accept={supportedResumeDocumentAccept}
        acceptedFileTypes={[{ icon: IconUpload, label: supportedResumeDocumentLabel }]}
        ariaLabel="选择要上传的简历文件"
        browseLabel="选择简历文件"
        description={fileUploadDescription}
        disabled={disabled}
        draggingLabel="松开上传简历文件"
        maxFiles={MAX_BULK_BATCH_SIZE}
        multiple
        onFileLimitExceeded={() => {
          toast.error(`最多 ${MAX_BULK_BATCH_SIZE} 份`);
        }}
        onFilesAccepted={handleFilesAccepted}
        onFilesSelected={validateResumeFiles}
        rejectionLabel={`仅支持上传 ${supportedResumeDocumentLabel} 文件`}
        resetKey={uploadResetKey}
        showFileList={false}
        title={fileUploadTitle}
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
      <IconFileUpload className="size-4" />
      新建招聘记录
    </Button>
  );
}
