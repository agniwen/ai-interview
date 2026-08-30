import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import type { UploadTaskInboxRecord, UploadTaskQueueState } from "@arc/shared/upload-task-inbox";

export interface UploadTaskPreviewState {
  record: UploadTaskInboxRecord | null;
  slug: string;
}

export function resolveUploadTaskPreviewState(
  state: UploadTaskPreviewState,
  slug: string,
): UploadTaskPreviewState {
  return state.slug === slug ? state : { record: null, slug };
}

export type UploadTaskStatusTone = "cancelled" | "completed" | "failed" | "pending" | "processing";

interface UploadTaskStatusMeta {
  label: string;
  tone: UploadTaskStatusTone;
}

export function getUploadTaskStatusMeta(state: UploadTaskQueueState): UploadTaskStatusMeta {
  if (state === "active") {
    return { label: "解析中", tone: "processing" };
  }
  if (state === "completed") {
    return { label: "解析完成", tone: "completed" };
  }
  if (state === "failed") {
    return { label: "解析失败", tone: "failed" };
  }
  if (state === "cancelled") {
    return { label: "已取消", tone: "cancelled" };
  }
  if (state === "duplicate-skipped") {
    return { label: "重复，已跳过", tone: "cancelled" };
  }
  if (state === "delayed") {
    return { label: "等待重试", tone: "pending" };
  }
  return { label: "等待解析", tone: "pending" };
}

type UploadTaskPreviewInput = Pick<UploadTaskInboxRecord, "originalFileName" | "previewTarget">;

export function getUploadTaskPreviewTarget(input: UploadTaskPreviewInput) {
  const documentKind = getResumeDocumentKind({
    fileName: input.originalFileName,
  });

  if (!input.previewTarget || !documentKind) {
    return null;
  }

  if (documentKind === "pptx") {
    return {
      ...input.previewTarget,
      kind: "pdf" as const,
      path: "resume-preview.pdf" as const,
    };
  }

  if (
    documentKind === "pdf" ||
    documentKind === "docx" ||
    documentKind === "xlsx" ||
    documentKind === "image"
  ) {
    return {
      ...input.previewTarget,
      kind: documentKind,
      path: "resume" as const,
    };
  }

  return null;
}
