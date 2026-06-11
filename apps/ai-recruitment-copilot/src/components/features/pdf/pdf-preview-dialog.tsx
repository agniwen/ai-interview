"use client";

import { XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PDFViewer } from "@/components/ui/pdf-viewer";

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
}

export function PdfPreviewDialog({ open, onOpenChange, url, filename }: PdfPreviewDialogProps) {
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
      <PDFViewer
        className="h-full"
        defaultThumbnailSidebarOpen
        defaultZoom={1}
        documentOptions={documentOptions}
        downloadFileName={filename ?? "resume.pdf"}
        file={url}
        onActivePageChange={setActivePage}
        onDocumentLoadSuccess={setNumPages}
        showUpload={false}
      />
    </Modal>
  );
}
