"use client";

import { IconDownload, IconLoader2, IconPhotoOff, IconX } from "@tabler/icons-react";
import { Suspense, lazy, useEffect, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import type { DocxViewerPreview as DocxViewerPreviewComponent } from "@/components/ui/docx-viewer";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { XlsxViewerPreview as XlsxViewerPreviewComponent } from "@/components/ui/xlsx-viewer";
import { cn } from "@arc/shared/utils";
import { runAsyncAction } from "@/lib/client/async-control";

export type OfficeResumePreviewKind = "docx" | "xlsx";
export type ResumeDocumentPreviewKind = "pdf" | "image" | OfficeResumePreviewKind;

const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

const DocxViewerPreview = lazy(async () => {
  const mod = await import("@/components/ui/docx-viewer");
  return { default: mod.DocxViewerPreview };
});

const XlsxViewerPreview = lazy(async () => {
  const mod = await import("@/components/ui/xlsx-viewer");
  return { default: mod.XlsxViewerPreview };
});

export interface ResumeDocumentPreviewDialogProps {
  downloadUrl?: string;
  kind: ResumeDocumentPreviewKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
}

export interface ResumeDocumentPreviewDialogDependencies {
  renderDocxPreview: (props: ComponentProps<typeof DocxViewerPreviewComponent>) => ReactNode;
  renderXlsxPreview: (props: ComponentProps<typeof XlsxViewerPreviewComponent>) => ReactNode;
}

const defaultResumeDocumentPreviewDialogDependencies: ResumeDocumentPreviewDialogDependencies = {
  renderDocxPreview: (props) => <DocxViewerPreview {...props} />,
  renderXlsxPreview: (props) => <XlsxViewerPreview {...props} />,
};

function getResumePreviewDownloadFileName(
  kind: ResumeDocumentPreviewKind,
  filename: string | undefined,
) {
  if (filename) {
    return filename;
  }
  if (kind === "docx") {
    return "resume.docx";
  }
  if (kind === "xlsx") {
    return "resume.xlsx";
  }
  if (kind === "image") {
    return "resume-image";
  }
  return "resume.pdf";
}

function getDefaultPreviewTitle(kind: ResumeDocumentPreviewKind) {
  if (kind === "docx") {
    return "Word 简历预览";
  }
  if (kind === "xlsx") {
    return "Excel 简历预览";
  }
  if (kind === "image") {
    return "图片简历预览";
  }
  return "简历预览";
}

function ResumePreviewHeaderActions({
  downloadFileName,
  downloadUrl,
  onClose,
}: {
  downloadFileName: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        nativeButton={false}
        render={
          <a aria-label="下载原文件" download={downloadFileName} href={downloadUrl}>
            <IconDownload className="size-4" />
            下载
          </a>
        }
        size="sm"
        variant="outline"
      />
      <Button aria-label="关闭" onClick={onClose} size="icon" type="button" variant="ghost">
        <IconX className="size-4" />
      </Button>
    </div>
  );
}

type ImagePreviewStatus = "loading" | "loaded" | "error";

export function ImageResumePreviewContent({ filename, url }: { filename?: string; url: string }) {
  const [status, setStatus] = useState<ImagePreviewStatus>("loading");
  const [imageSource, setImageSource] = useState<{
    objectUrl: string;
    requestUrl: string;
  } | null>(null);
  const imageUrl = imageSource?.requestUrl === url ? imageSource.objectUrl : null;

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setStatus("loading");
    setImageSource(null);

    async function loadImage() {
      await runAsyncAction({
        onError: () => {
          if (!controller.signal.aborted) {
            setStatus("error");
          }
        },
        operation: async () => {
          const response = await fetch(url, {
            credentials: "include",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Image preview request failed with status ${response.status}`);
          }
          const blob = await response.blob();
          if (controller.signal.aborted) {
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setImageSource({ objectUrl, requestUrl: url });
        },
      });
    }

    void loadImage();

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url]);

  return (
    <div className="relative flex min-h-full min-w-full items-start justify-center p-6">
      {status === "loading" ? (
        <output className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
          <IconLoader2 className="size-5 animate-spin" />
          <span>图片加载中</span>
        </output>
      ) : null}
      {status === "error" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground"
          role="alert"
        >
          <IconPhotoOff className="size-8" />
          <p className="font-medium text-foreground text-sm">图片加载失败</p>
          <p className="text-xs">请稍后重试，或下载原文件查看。</p>
        </div>
      ) : null}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- User-uploaded resume images are loaded from authenticated API URLs and displayed as object URLs.
        <img
          alt={filename ?? "图片简历预览"}
          className={cn(
            "h-auto max-w-full rounded-md bg-background object-contain shadow-sm transition-opacity",
            status === "loaded" ? "opacity-100" : "opacity-0",
          )}
          decoding="async"
          draggable={false}
          onError={() => setStatus("error")}
          onLoad={() => setStatus("loaded")}
          src={imageUrl}
        />
      ) : null}
    </div>
  );
}

export function ResumeDocumentPreviewDialog({
  dependencies = defaultResumeDocumentPreviewDialogDependencies,
  downloadUrl,
  kind,
  open,
  onOpenChange,
  url,
  filename,
}: ResumeDocumentPreviewDialogProps & { dependencies?: ResumeDocumentPreviewDialogDependencies }) {
  const [isDark, setIsDark] = useState(false);
  const title = filename ?? getDefaultPreviewTitle(kind);
  const downloadFileName = getResumePreviewDownloadFileName(kind, filename);
  const resolvedDownloadUrl = downloadUrl ?? url;

  if (kind === "pdf") {
    return (
      <Suspense fallback={null}>
        <PdfPreviewDialog
          downloadFileName={downloadFileName}
          downloadUrl={resolvedDownloadUrl}
          filename={filename}
          onOpenChange={onOpenChange}
          open={open}
          url={url}
        />
      </Suspense>
    );
  }

  if (kind === "image") {
    return (
      <Modal
        bodyClassName="min-h-0 overflow-auto bg-muted/30 p-0"
        className="h-[92dvh]"
        description="JPG / PNG"
        headerClassName="px-5 py-3"
        headerLayout="row"
        onOpenChange={onOpenChange}
        open={open}
        showCloseButton={false}
        size="full"
        title={title}
        headerExtra={
          <ResumePreviewHeaderActions
            downloadFileName={downloadFileName}
            downloadUrl={resolvedDownloadUrl}
            onClose={() => onOpenChange(false)}
          />
        }
      >
        <ImageResumePreviewContent filename={filename} url={url} />
      </Modal>
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
        <ResumePreviewHeaderActions
          downloadFileName={downloadFileName}
          downloadUrl={resolvedDownloadUrl}
          onClose={() => onOpenChange(false)}
        />
      }
    >
      {kind === "docx"
        ? dependencies.renderDocxPreview({
            className: "h-full",
            fileName: filename,
            isDark,
            onIsDarkChange: setIsDark,
            showDownload: false,
            showUpload: false,
            src: url,
          })
        : dependencies.renderXlsxPreview({
            className: "h-full",
            fileName: filename,
            isDark,
            onIsDarkChange: setIsDark,
            showDownload: false,
            showUpload: false,
            src: url,
          })}
    </Modal>
  );
}
