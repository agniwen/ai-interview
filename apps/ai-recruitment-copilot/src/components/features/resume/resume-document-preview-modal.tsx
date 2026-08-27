"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import type {
  ResumeDocumentPreviewDialogProps,
  ResumeDocumentPreviewKind,
} from "@/components/features/resume/resume-document-preview-dialog";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

interface RetainedResumePreview {
  fileName?: string;
  kind: ResumeDocumentPreviewKind;
  url: string;
}

export interface ResumeDocumentPreviewModalDependencies {
  PreviewDialog: ComponentType<ResumeDocumentPreviewDialogProps>;
}

const defaultDependencies: ResumeDocumentPreviewModalDependencies = {
  PreviewDialog: ResumeDocumentPreviewDialog,
};

export function ResumeDocumentPreviewModal({
  fileName,
  onClose,
  url,
  dependencies = defaultDependencies,
}: {
  fileName: string | null | undefined;
  onClose: () => void;
  url: string | null;
  dependencies?: ResumeDocumentPreviewModalDependencies;
}) {
  const { PreviewDialog } = dependencies;
  const kind = getPreviewableResumeDocumentKind({ fileName });
  const [preview, setPreview] = useState<RetainedResumePreview | null>(null);
  const [open, setOpen] = useState(false);
  const openFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!(kind && url)) {
      // oxlint-disable-next-line react/set-state-in-effect -- Incoming preview props control this retained modal lifecycle.
      setOpen(false);
      return;
    }

    // oxlint-disable-next-line react/set-state-in-effect -- The dialog must commit closed before its opening frame is scheduled.
    setOpen(false);
    // oxlint-disable-next-line react/set-state-in-effect -- Retain the payload until the closing transition completes.
    setPreview({ fileName: fileName ?? undefined, kind, url });
  }, [fileName, kind, url]);

  useEffect(
    () => () => {
      if (openFrameRef.current !== null) {
        cancelAnimationFrame(openFrameRef.current);
      }
    },
    [],
  );

  const handleReady = useCallback(() => {
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
    }
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = null;
      setOpen(true);
    });
  }, []);

  if (!preview) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <PreviewDialog
        filename={preview.fileName}
        kind={preview.kind}
        onOpenChange={setOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) {
            setPreview(null);
            onClose();
          }
        }}
        onReady={handleReady}
        open={open}
        url={preview.url}
      />
    </Suspense>
  );
}
