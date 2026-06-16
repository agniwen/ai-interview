"use client";

import { DownloadIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PDFViewer } from "@/components/ui/pdf-viewer";

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
  downloadFileName?: string;
  downloadUrl?: string;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  url,
  filename,
  downloadFileName,
  downloadUrl,
}: PdfPreviewDialogProps) {
  const [numPages, setNumPages] = useState(0);
  const [activePage, setActivePage] = useState(1);

  const documentOptions = useMemo(
    () => ({
      cMapPacked: true,
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
      standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/",
    }),
    [],
  );

  const pageCountLabel = numPages ? `第 ${activePage} / ${numPages} 页` : "加载中…";
  const resolvedDownloadFileName = downloadFileName ?? filename ?? "resume.pdf";

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden bg-muted/30 p-0"
      className="h-[92dvh]"
      description={pageCountLabel}
      headerClassName="px-5 py-3"
      headerLayout="row"
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={false}
      size="full"
      title={filename ?? "简历预览"}
      headerExtra={
        <div className="flex items-center gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <a
              aria-label="下载原文件"
              download={resolvedDownloadFileName}
              href={downloadUrl ?? url}
            >
              <DownloadIcon className="size-4" />
              下载
            </a>
          </Button>
          <Button
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      }
    >
      <PDFViewer
        className="h-full"
        defaultThumbnailSidebarOpen
        defaultZoom={1}
        documentOptions={documentOptions}
        downloadFileName={resolvedDownloadFileName}
        file={url}
        onActivePageChange={setActivePage}
        onDocumentLoadSuccess={setNumPages}
        showDownload={false}
        showUpload={false}
      />
    </Modal>
  );
}
