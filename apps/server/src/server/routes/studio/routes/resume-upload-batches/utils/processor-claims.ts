import { db } from "../../../../../../lib/server/db";
import { bindResumeProcessingDatabase } from "@app/resume-processing/ingest/database-context";
import * as implementation from "@app/resume-processing/ingest/batches/utils/processor-claims";

// oxlint-disable-next-line no-barrel-file -- This route-local Server facade preserves existing imports while the reusable implementation has one package owner.
export * from "@app/resume-processing/ingest/batches/utils/processor-claims";

export const assertBatchItemNotCancelled: typeof implementation.assertBatchItemNotCancelled =
  bindResumeProcessingDatabase(db, implementation.assertBatchItemNotCancelled);
export const getClaimMissRetryError: typeof implementation.getClaimMissRetryError =
  bindResumeProcessingDatabase(db, implementation.getClaimMissRetryError);
export const isBatchItemCancelled: typeof implementation.isBatchItemCancelled =
  bindResumeProcessingDatabase(db, implementation.isBatchItemCancelled);
export const loadClaimMissSnapshot: typeof implementation.loadClaimMissSnapshot =
  bindResumeProcessingDatabase(db, implementation.loadClaimMissSnapshot);
export const releaseBatchItemForRetry: typeof implementation.releaseBatchItemForRetry =
  bindResumeProcessingDatabase(db, implementation.releaseBatchItemForRetry);
