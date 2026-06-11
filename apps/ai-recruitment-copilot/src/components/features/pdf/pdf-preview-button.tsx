"use client";

import { EyeIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";

// Load the dialog (and therefore pdfjs-dist) only in the browser. pdfjs-dist
// touches browser-only globals (DOMMatrix, Path2D, ImageData) at module
// evaluation, so importing it during SSR crashes with "DOMMatrix is not
// defined". ssr: false defers the whole module until after hydration.
const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

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
        variant="outline"
      >
        <EyeIcon className="size-3.5" />
        {label}
      </Button>
      {open && !disabled ? (
        <Suspense fallback={null}>
          <PdfPreviewDialog filename={filename} onOpenChange={setOpen} open={open} url={url} />
        </Suspense>
      ) : null}
    </>
  );
}
