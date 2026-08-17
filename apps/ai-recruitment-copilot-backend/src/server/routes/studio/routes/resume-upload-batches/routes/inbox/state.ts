import type { ResumeUploadBatchItemStatus } from "@arc/db-schema/schema";
import type { UploadTaskInboxRecord, UploadTaskQueueState } from "@arc/shared/upload-task-inbox";
import { z } from "zod";

const QUEUE_STATES = new Set<string>([
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

const numericQueueProgressSchema = z.number();
const detailedQueueProgressSchema = z.object({
  percentage: z.number().optional(),
  progress: z.number().optional(),
});
export const queueProgressSchema = z.union([
  numericQueueProgressSchema,
  detailedQueueProgressSchema,
  z.string(),
]);

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function isQueueState(value: string): value is UploadTaskQueueState {
  return QUEUE_STATES.has(value);
}

export function resolveInboxPreviewTarget(input: {
  poolItemId: string | null;
  poolItemStatus: string | null;
  resumeRecordId: string | null;
  target: "resume_library" | "resume_pool";
}): UploadTaskInboxRecord["previewTarget"] {
  if (input.target === "resume_pool") {
    return input.poolItemId && input.poolItemStatus === "active"
      ? { id: input.poolItemId, resource: "resume-pool" }
      : null;
  }

  return input.resumeRecordId ? { id: input.resumeRecordId, resource: "resumes" } : null;
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
  if (liveState && isQueueState(liveState)) {
    return liveState;
  }
  if (status === "pending") {
    return "waiting";
  }
  if (status === "processing") {
    return "active";
  }
  return "completed";
}

export function normalizeQueueProgress(
  progress: z.output<typeof queueProgressSchema>,
): number | null {
  const numericProgress = numericQueueProgressSchema.safeParse(progress);
  if (numericProgress.success && Number.isFinite(numericProgress.data)) {
    return clampPercent(numericProgress.data);
  }
  const detailedProgress = detailedQueueProgressSchema.safeParse(progress);
  if (!detailedProgress.success) {
    return null;
  }
  if (
    detailedProgress.data.percentage !== undefined &&
    Number.isFinite(detailedProgress.data.percentage)
  ) {
    return clampPercent(detailedProgress.data.percentage);
  }
  if (
    detailedProgress.data.progress !== undefined &&
    Number.isFinite(detailedProgress.data.progress)
  ) {
    const normalized =
      detailedProgress.data.progress <= 1
        ? detailedProgress.data.progress * 100
        : detailedProgress.data.progress;
    return clampPercent(normalized);
  }
  return null;
}
