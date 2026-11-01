"use client";

import { IconDownload, IconX } from "@tabler/icons-react";
import { Component, Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Modal } from "@/components/ui/modal";
import type { PDFViewer as PDFViewerComponent } from "@/components/ui/pdf-viewer";

type PdfViewerProps = ComponentProps<typeof PDFViewerComponent>;

interface PdfViewerModule {
  PDFViewer: ComponentType<PdfViewerProps>;
}

function isDynamicImportFetchError(error: Error) {
  return error.message.includes("Failed to fetch dynamically imported module");
}

async function loadPdfViewer(): Promise<{ default: ComponentType<PdfViewerProps> }> {
  try {
    const mod = await import("@/components/ui/pdf-viewer");
    return { default: mod.PDFViewer };
  } catch (error) {
    if (import.meta.env.DEV && error instanceof Error && isDynamicImportFetchError(error)) {
      const retryUrl = `/src/components/ui/pdf-viewer.tsx?retry=${Date.now()}`;
      // eslint-disable-next-line no-inline-comments -- Vite requires this marker inside import().
      const mod: PdfViewerModule = await import(/* @vite-ignore */ retryUrl);
      return { default: mod.PDFViewer };
    }
    throw error;
  }
}

const PDFViewer = lazy(loadPdfViewer);

class PdfViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function PdfViewerLoading() {
  return (
    <output className="flex h-full items-center justify-center text-muted-foreground text-sm">
      PDF 加载中…
    </output>
  );
}

export interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  onReady?: () => void;
  url: string;
  filename?: string;
  downloadFileName?: string;
  downloadUrl?: string;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  onReady,
  url,
  filename,
  downloadFileName,
  downloadUrl,
}: PdfPreviewDialogProps) {
  const isMobile = useIsMobile();
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null);

  const documentOptions = useMemo(
    () => ({
      cMapPacked: true,
      cMapUrl: "https://unpkg.com/pdfjs-dist@5.4.296/cmaps/",
      standardFontDataUrl: "https://unpkg.com/pdfjs-dist@5.4.296/standard_fonts/",
    }),
    [],
  );

  const resolvedDownloadFileName = downloadFileName ?? filename ?? "resume.pdf";

  useEffect(() => {
    onReady?.();
  }, [onReady, url]);

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden bg-muted/30 p-0"
      fullScreen
      headerClassName="md:px-3 md:py-2"
      headerLayout="row"
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
      open={open}
      showCloseButton={false}
      size="full"
      title={
        <span className="block truncate text-sm font-medium" title={filename}>
          {filename ?? "简历预览"}
        </span>
      }
      headerExtra={
        <div className="flex items-center gap-2">
          <div className="hidden md:block" ref={setToolbarContainer} />
          <Button
            nativeButton={false}
            render={
              <a
                aria-label="下载原文件"
                download={resolvedDownloadFileName}
                href={downloadUrl ?? url}
              >
                <IconDownload className="size-4" />
                下载
              </a>
            }
            size="sm"
            variant="outline"
          />
          <Button
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconX className="size-4" />
          </Button>
        </div>
      }
    >
      <div className="h-full min-h-0" data-vaul-no-drag>
        <PdfViewerErrorBoundary
          key={url}
          fallback={
            <iframe
              className="h-full w-full bg-background"
              sandbox=""
              src={url}
              title={filename ?? "简历预览"}
            />
          }
        >
          <Suspense fallback={<PdfViewerLoading />}>
            <PDFViewer
              className="h-full"
              defaultZoom={1}
              documentOptions={documentOptions}
              downloadFileName={resolvedDownloadFileName}
              file={url}
              enableModifierWheelZoom
              enableTouchPinchZoom
              fitWidthOnMobile
              scrollFade
              showRotateControlsOnMobile={false}
              showSearchOnMobile={false}
              toolbarContainer={isMobile ? undefined : toolbarContainer}
              showDownload={false}
              showUpload={false}
            />
          </Suspense>
        </PdfViewerErrorBoundary>
      </div>
    </Modal>
  );
}
