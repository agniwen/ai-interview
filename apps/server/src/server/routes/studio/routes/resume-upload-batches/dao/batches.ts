import { db } from "../../../../../../lib/server/db/index";
import { createResumeIngest } from "@app/resume-processing/ingest";
import type { ResumeIngest } from "@app/resume-processing/ingest";

const ingest = createResumeIngest(db);

export const cancelBatch: ResumeIngest["cancelBatch"] = ingest.cancelBatch;
export const claimNextPendingItem: ResumeIngest["claimNextPendingItem"] =
  ingest.claimNextPendingItem;
export const claimPendingItemById: ResumeIngest["claimPendingItemById"] =
  ingest.claimPendingItemById;
export const deleteBatch: ResumeIngest["deleteBatch"] = ingest.deleteBatch;
export const insertBatchWithItems: ResumeIngest["insertBatchWithItems"] =
  ingest.insertBatchWithItems;
export const listBatches: ResumeIngest["listBatches"] = ingest.listBatches;
export const loadActiveBatch: ResumeIngest["loadActiveBatch"] = ingest.loadActiveBatch;
export const loadActiveBatches: ResumeIngest["loadActiveBatches"] = ingest.loadActiveBatches;
export const loadBatchDetail: ResumeIngest["loadBatchDetail"] = ingest.loadBatchDetail;
export const reconcileBatchProgress: ResumeIngest["reconcileBatchProgress"] =
  ingest.reconcileBatchProgress;
export const recoverIncompleteBatchItems: ResumeIngest["recoverIncompleteBatchItems"] =
  ingest.recoverIncompleteBatchItems;
export const reviveOrphans: ResumeIngest["reviveOrphans"] = ingest.reviveOrphans;
export const reviveRetriableFailures: ResumeIngest["reviveRetriableFailures"] =
  ingest.reviveRetriableFailures;
export const toBatchDto: ResumeIngest["toBatchDto"] = ingest.toBatchDto;
export const toItemDto: ResumeIngest["toItemDto"] = ingest.toItemDto;
export type { CreateBatchInput } from "@app/resume-processing/ingest";
