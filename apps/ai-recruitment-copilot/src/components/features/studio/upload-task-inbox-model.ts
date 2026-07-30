import type { UploadTaskQueueState } from "@arc/shared/upload-task-inbox";

export type UploadTaskStatusTone = "cancelled" | "completed" | "failed" | "pending" | "processing";

export function getUploadTaskStatusMeta(state: UploadTaskQueueState): {
  label: string;
  tone: UploadTaskStatusTone;
} {
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
