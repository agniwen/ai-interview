"use client";

import { XIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { DocxViewerPreview } from "@/components/ui/docx-viewer";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { XlsxViewerPreview } from "@/components/ui/xlsx-viewer";

export type OfficeResumePreviewKind = "docx" | "xlsx";
export type ResumeDocumentPreviewKind = "pdf" | OfficeResumePreviewKind;

const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

export interface ResumeDocumentPreviewDialogProps {
  kind: ResumeDocumentPreviewKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
}

export function ResumeDocumentPreviewDialog({
  kind,
  open,
  onOpenChange,
  url,
  filename,
}: ResumeDocumentPreviewDialogProps) {
  const [isDark, setIsDark] = useState(false);
  const title = filename ?? (kind === "docx" ? "Word 简历预览" : "Excel 简历预览");

  if (kind === "pdf") {
    return (
      <Suspense fallback={null}>
        <PdfPreviewDialog filename={filename} onOpenChange={onOpenChange} open={open} url={url} />
      </Suspense>
    );
  }

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden bg-muted/30 p-0"
      className="h-[92dvh]"
      description={kind === "docx" ? "DOCX" : "XLSX"}
      headerClassName="px-5 py-3"
      headerLayout="row"
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={false}
      size="full"
      title={title}
      headerExtra={
        <Button
          aria-label="关闭"
          onClick={() => onOpenChange(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-4" />
        </Button>
      }
    >
      {kind === "docx" ? (
        <DocxViewerPreview
          className="h-full"
          fileName={filename}
          isDark={isDark}
          onIsDarkChange={setIsDark}
          showUpload={false}
          src={url}
        />
      ) : (
        <XlsxViewerPreview
          className="h-full"
          fileName={filename}
          isDark={isDark}
          onIsDarkChange={setIsDark}
          showUpload={false}
          src={url}
        />
      )}
    </Modal>
  );
}
