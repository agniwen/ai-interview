"use client";

import { EyeIcon } from "lucide-react";
import { useState } from "react";
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PdfPreviewButtonProps {
  url: string;
  filename?: string;
  label?: string;
  className?: string;
}

export function PdfPreviewButton({
  url,
  filename,
  label = "预览",
  className,
}: PdfPreviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={cn("h-8 shrink-0 gap-1.5", className)}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <EyeIcon className="size-3.5" />
        {label}
      </Button>
      <PdfPreviewDialog filename={filename} onOpenChange={setOpen} open={open} url={url} />
    </>
  );
}
