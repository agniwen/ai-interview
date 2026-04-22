"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  LoaderCircleIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Worker bootstrap — Next.js (Turbopack/Webpack) resolves the asset URL via
// `new URL(..., import.meta.url)` and emits it into the client bundle. The
// CDN fallback keeps dev working even if the bundler cannot resolve the asset.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
}

export function PdfPreviewDialog({ open, onOpenChange, url, filename }: PdfPreviewDialogProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset internal state whenever the dialog is re-opened with a new URL so
  // a previously-viewed PDF doesn't flash before the new one loads.
  useEffect(() => {
    if (open) {
      setNumPages(null);
      setPageNumber(1);
      setLoadError(null);
    }
  }, [open, url]);

  // Keep the scroll position at the top when switching pages — otherwise
  // the previous page's vertical offset carries over and pages look cut off.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pageNumber]);

  // react-pdf wants a stable options object reference, otherwise it reloads the
  // document on every render. Source (url) is passed separately via `file`.
  const documentOptions = useMemo(
    () => ({
      cMapPacked: true,
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
    }),
    [],
  );

  const canPrev = pageNumber > 1;
  const canNext = numPages !== null && pageNumber < numPages;
  const canZoomIn = scale < MAX_SCALE - 1e-6;
  const canZoomOut = scale > MIN_SCALE + 1e-6;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex h-[88dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        showCloseButton
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-4 border-b px-5 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-medium">
              {filename ?? "简历预览"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {numPages ? `第 ${pageNumber} / ${numPages} 页` : "加载中..."}
            </DialogDescription>
          </div>

          <div className="flex items-center gap-1">
            <Button
              disabled={!canPrev}
              onClick={() => setPageNumber((n) => Math.max(1, n - 1))}
              size="icon"
              type="button"
              variant="ghost"
              aria-label="上一页"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              disabled={!canNext}
              onClick={() => setPageNumber((n) => Math.min(numPages ?? n, n + 1))}
              size="icon"
              type="button"
              variant="ghost"
              aria-label="下一页"
            >
              <ChevronRightIcon className="size-4" />
            </Button>

            <span className="mx-1 h-5 w-px bg-border" />

            <Button
              disabled={!canZoomOut}
              onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
              size="icon"
              type="button"
              variant="ghost"
              aria-label="缩小"
            >
              <ZoomOutIcon className="size-4" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Button
              disabled={!canZoomIn}
              onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
              size="icon"
              type="button"
              variant="ghost"
              aria-label="放大"
            >
              <ZoomInIcon className="size-4" />
            </Button>

            <span className="mx-1 h-5 w-px bg-border" />

            <Button asChild size="icon" type="button" variant="ghost" aria-label="下载">
              <a download={filename ?? "resume.pdf"} href={url} rel="noopener" target="_blank">
                <DownloadIcon className="size-4" />
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div
          className={cn("flex-1 overflow-auto bg-muted/30", "flex justify-center")}
          ref={scrollRef}
        >
          {loadError ? (
            <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {loadError}
            </div>
          ) : (
            <Document
              file={url}
              loading={
                <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground text-sm">
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  正在加载 PDF...
                </div>
              }
              onLoadError={(error) => {
                console.error("[pdf-preview] load error", error);
                setLoadError("PDF 加载失败，请稍后重试或下载后查看。");
              }}
              onLoadSuccess={({ numPages: total }) => setNumPages(total)}
              options={documentOptions}
            >
              {numPages ? (
                <Page
                  className="my-4 shadow-sm"
                  pageNumber={pageNumber}
                  renderAnnotationLayer
                  renderTextLayer
                  scale={scale}
                />
              ) : null}
            </Document>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
