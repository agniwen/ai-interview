"use client";

import { lazy, Suspense } from "react";

import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

export function ResumeDocumentPreviewModal({
  fileName,
  onClose,
  url,
}: {
  fileName: string | null | undefined;
  onClose: () => void;
  url: string | null;
}) {
  const kind = getPreviewableResumeDocumentKind({ fileName });
  if (!kind || !url) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ResumeDocumentPreviewDialog
        filename={fileName ?? undefined}
        kind={kind}
        onOpenChange={(open) => !open && onClose()}
        open
        url={url}
      />
    </Suspense>
  );
}
