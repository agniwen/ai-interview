"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";
import { ResumeDocumentPreviewDialog } from "@/components/features/resume/resume-document-preview-dialog";
import type {
  ResumeDocumentPreviewDialogProps,
  ResumeDocumentPreviewKind,
} from "@/components/features/resume/resume-document-preview-dialog";

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

  useEffect(() => {
    if (!preview) {
      return;
    }
    if (openFrameRef.current !== null) {
      cancelAnimationFrame(openFrameRef.current);
    }
    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = null;
      setOpen(true);
    });

    return () => {
      if (openFrameRef.current !== null) {
        cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
    };
  }, [preview]);

  if (!preview) {
    return null;
  }

  return (
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
      open={open}
      url={preview.url}
    />
  );
}
