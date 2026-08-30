"use client";

import { IconEye } from "@tabler/icons-react";
import { useState } from "react";
import { PdfPreviewDialog } from "@/components/features/pdf/pdf-preview-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";

export interface PdfPreviewButtonProps {
  url: string;
  filename?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
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
        variant="ghost"
      >
        <IconEye className="size-3.5" />
        {label}
      </Button>
      {open && !disabled ? (
        <PdfPreviewDialog filename={filename} onOpenChange={setOpen} open={open} url={url} />
      ) : null}
    </>
  );
}
