import type { ResumeUploadBatchItemStatus } from "@arc/db-schema/schema";
import type { UploadTaskQueueState } from "@arc/shared/upload-task-inbox";

const QUEUE_STATES = new Set<UploadTaskQueueState>([
  "active",
  "completed",
  "delayed",
  "failed",
  "paused",
  "prioritized",
  "unknown",
  "waiting",
  "waiting-children",
]);

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function resolveInboxQueueState(
  status: ResumeUploadBatchItemStatus,
  liveState: string | null,
): UploadTaskQueueState {
  if (status === "failed") {
    return "failed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "duplicate_skipped") {
    return "duplicate-skipped";
  }
  if (status === "succeeded") {
    return "completed";
  }
  if (liveState && QUEUE_STATES.has(liveState as UploadTaskQueueState)) {
    return liveState as UploadTaskQueueState;
  }
  if (status === "pending") {
    return "waiting";
  }
  if (status === "processing") {
    return "active";
  }
  return "completed";
}

export function normalizeQueueProgress(progress: unknown): number | null {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    return clampPercent(progress);
  }
  if (!progress || typeof progress !== "object") {
    return null;
  }
  const value = progress as { percentage?: unknown; progress?: unknown };
  if (typeof value.percentage === "number" && Number.isFinite(value.percentage)) {
    return clampPercent(value.percentage);
  }
  if (typeof value.progress === "number" && Number.isFinite(value.progress)) {
    const normalized = value.progress <= 1 ? value.progress * 100 : value.progress;
    return clampPercent(normalized);
  }
  return null;
}
