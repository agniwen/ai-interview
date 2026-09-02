import { db } from "@server/lib/server/db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/ingest";

configureResumeProcessingDatabase(db);

export {
  cancelBatch,
  claimNextPendingItem,
  claimPendingItemById,
  deleteBatch,
  insertBatchWithItems,
  listBatches,
  loadActiveBatch,
  loadActiveBatches,
  loadBatchDetail,
  reconcileBatchProgress,
  recoverIncompleteBatchItems,
  reviveOrphans,
  reviveRetriableFailures,
  toBatchDto,
  toItemDto,
} from "@app/resume-processing/ingest";
export type { CreateBatchInput } from "@app/resume-processing/ingest";
