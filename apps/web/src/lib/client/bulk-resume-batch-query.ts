import type { ResumeUploadBatchStatus } from "@arc/db-schema/schema";

export const BULK_RESUME_BATCH_POLL_INTERVAL_MS = 10_000;

export function bulkResumeBatchRefetchInterval(
  batches?: readonly { status: ResumeUploadBatchStatus }[],
): number | false {
  const hasActiveBatch = batches?.some(
    (batch) => batch.status === "pending" || batch.status === "running",
  );
  return hasActiveBatch ? BULK_RESUME_BATCH_POLL_INTERVAL_MS : false;
}
