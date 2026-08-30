"use client";

import { IconEye } from "@tabler/icons-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { PdfPreviewButton } from "@/components/features/pdf/pdf-preview-button";
import { ResumeDocumentPreviewDialog } from "@/components/features/resume/resume-document-preview-dialog";
import type { ResumeDocumentPreviewKind } from "@/components/features/resume/resume-document-preview-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import { cn } from "@arc/shared/utils";

export type PreviewableResumeDocumentKind = ResumeDocumentPreviewKind;
export const UNSUPPORTED_RESUME_DOCUMENT_PREVIEW_TOOLTIP =
  "该格式暂不支持预览，仅 PDF、DOCX、XLSX、图片格式支持预览。";

export function getPreviewableResumeDocumentKind(input: {
  fileName?: string | null;
  mediaType?: string | null;
}): PreviewableResumeDocumentKind | null {
  const kind = getResumeDocumentKind({
    fileName: input.fileName ?? undefined,
    mediaType: input.mediaType ?? undefined,
  });

  if (kind === "pdf" || kind === "docx" || kind === "xlsx" || kind === "image") {
    return kind;
  }

  return input.fileName || input.mediaType ? null : "pdf";
}

export function isPreviewableResumeDocumentInput(input: {
  fileName?: string | null;
  mediaType?: string | null;
}) {
  return getPreviewableResumeDocumentKind(input) !== null;
}

export function UnsupportedResumeDocumentPreviewTooltip({ children }: { children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{UNSUPPORTED_RESUME_DOCUMENT_PREVIEW_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

export interface ResumeDocumentPreviewButtonProps {
  url: string;
  filename?: string | null;
  mediaType?: string | null;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function ResumeDocumentPreviewButton({
  url,
  filename,
  mediaType,
  label = "预览",
  className,
  disabled,
}: ResumeDocumentPreviewButtonProps) {
  const [open, setOpen] = useState(false);
  const kind = getPreviewableResumeDocumentKind({ fileName: filename, mediaType });

  if (!kind) {
    return null;
  }

  if (kind === "pdf") {
    return (
      <PdfPreviewButton
        className={className}
        disabled={disabled}
        filename={filename ?? undefined}
        label={label}
        url={url}
      />
    );
  }

  return (
    <>
      <Button
        className={cn("h-8 shrink-0 gap-1.5", className)}
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <IconEye className="size-3.5" />
        {label}
      </Button>
      {open && !disabled ? (
        <ResumeDocumentPreviewDialog
          filename={filename ?? undefined}
          kind={kind}
          onOpenChange={setOpen}
          open={open}
          url={url}
        />
      ) : null}
    </>
  );
}
