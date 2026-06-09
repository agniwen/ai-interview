"use client";

import { UploadCloudIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_BULK_BATCH_SIZE, MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";

interface Props {
  disabled: boolean;
  onFilesPicked: (files: File[]) => void;
}

export function BulkUploadButton({ disabled, onFilesPicked }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handlePick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files ?? [])];
    e.target.value = "";
    if (list.length === 0) {
      return;
    }
    if (list.length > MAX_BULK_BATCH_SIZE) {
      toast.error(`最多 ${MAX_BULK_BATCH_SIZE} 份`);
      return;
    }
    const oversize = list.find((f) => f.size > MAX_RESUME_FILE_SIZE_BYTES);
    if (oversize) {
      toast.error(`「${oversize.name}」超过 20MB`);
      return;
    }
    const nonPdf = list.find((f) => !/\.pdf$/i.test(f.name));
    if (nonPdf) {
      toast.error(`「${nonPdf.name}」不是 PDF`);
      return;
    }
    onFilesPicked(list);
  }

  return (
    <>
      <input
        accept="application/pdf,.pdf"
        aria-label="选择要批量上传的简历 PDF"
        className="hidden"
        multiple
        onChange={handleChange}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={disabled}
        onClick={handlePick}
        title={disabled ? "已有进行中的批量上传" : undefined}
        type="button"
        variant="outline"
      >
        <UploadCloudIcon className="size-4" />
        批量上传
      </Button>
    </>
  );
}
