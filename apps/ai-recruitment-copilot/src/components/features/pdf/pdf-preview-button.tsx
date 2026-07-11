"use client";

import { IconDownload, IconEye, IconX } from "@tabler/icons-react";
import { Component, Suspense, lazy, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import type { PdfPreviewDialogProps } from "@/components/features/pdf/pdf-preview-dialog";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@arc/shared/utils";

interface PdfPreviewDialogModule {
  PdfPreviewDialog: ComponentType<PdfPreviewDialogProps>;
}

function isDynamicImportFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Failed to fetch dynamically imported module");
}

async function loadPdfPreviewDialog(): Promise<{
  default: ComponentType<PdfPreviewDialogProps>;
}> {
  try {
    const mod = await import("@/components/features/pdf/pdf-preview-dialog");
    return { default: mod.PdfPreviewDialog };
  } catch (error) {
    if (import.meta.env.DEV && isDynamicImportFetchError(error)) {
      const retryUrl = `/src/components/features/pdf/pdf-preview-dialog.tsx?retry=${Date.now()}`;
      // eslint-disable-next-line no-inline-comments -- Vite requires this marker inside import().
      const mod = (await import(/* @vite-ignore */ retryUrl)) as PdfPreviewDialogModule;
      return { default: mod.PdfPreviewDialog };
    }
    throw error;
  }
}

const PdfPreviewDialog = lazy(loadPdfPreviewDialog);

class PdfPreviewErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback: ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export interface PdfPreviewButtonProps {
  url: string;
  filename?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

function PdfPreviewFallbackDialog({
  filename,
  onOpenChange,
  open,
  url,
}: Pick<PdfPreviewDialogProps, "filename" | "onOpenChange" | "open" | "url">) {
  const resolvedDownloadFileName = filename ?? "resume.pdf";

  return (
    <Modal
      bodyClassName="min-h-0 overflow-hidden bg-muted/30 p-0"
      className="h-[92dvh]"
      description="浏览器内置预览"
      headerClassName="px-5 py-3"
      headerLayout="row"
      onOpenChange={onOpenChange}
      open={open}
      showCloseButton={false}
      size="full"
      title={filename ?? "简历预览"}
      headerExtra={
        <div className="flex items-center gap-2">
          <Button
            nativeButton={false}
            render={
              <a aria-label="下载原文件" download={resolvedDownloadFileName} href={url}>
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
      <iframe className="h-full w-full bg-background" src={url} title={filename ?? "简历预览"} />
    </Modal>
  );
}

export function PdfPreviewButton({
  url,
  filename,
  label = "预览",
  className,
  disabled,
}: PdfPreviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={cn("h-8 shrink-0 gap-1.5", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <IconEye className="size-3.5" />
        {label}
      </Button>
      {open && !disabled ? (
        <PdfPreviewErrorBoundary
          fallback={
            <PdfPreviewFallbackDialog
              filename={filename}
              onOpenChange={setOpen}
              open={open}
              url={url}
            />
          }
        >
          <Suspense fallback={null}>
            <PdfPreviewDialog filename={filename} onOpenChange={setOpen} open={open} url={url} />
          </Suspense>
        </PdfPreviewErrorBoundary>
      ) : null}
    </>
  );
}
