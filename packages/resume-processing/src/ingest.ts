import type { Database } from "@app/database";
import { bindResumeProcessingDatabase } from "./database";
import * as batches from "./ingest/batches";
import * as processor from "./internal/studio/resume-upload-batches/utils/processor";
import * as workflow from "./internal/agents/mastra/workflows/bulk-resume-upload-workflow";

export type { CreateBatchInput } from "./ingest/batches";
export type { ResumeUploadBatchProcessorDependencies } from "./internal/studio/resume-upload-batches/utils/processor";
export { createBulkResumeUploadWorkflow } from "./internal/agents/mastra/workflows/bulk-resume-upload-workflow";
export type {
  BulkResumeUploadWorkflowDeps,
  BulkResumeUploadWorkflowOutput,
} from "./internal/agents/mastra/workflows/bulk-resume-upload-workflow";

export function createResumeIngest(database: Database) {
  const bind = <Arguments extends unknown[], Result>(operation: (...args: Arguments) => Result) =>
    bindResumeProcessingDatabase(database, operation);
  const processBatchItem = bind(processor.processBatchItem);
  const processNextItem = bind(processor.processNextItem);
  const bulkResumeUploadWorkflow = workflow.createBulkResumeUploadWorkflow({
    processItem: processBatchItem,
  });

  return {
    bulkResumeUploadWorkflow,
    cancelBatch: bind(batches.cancelBatch),
    claimNextPendingItem: bind(batches.claimNextPendingItem),
    claimPendingItemById: bind(batches.claimPendingItemById),
    createResumeUploadBatchProcessor(
      dependencies: processor.ResumeUploadBatchProcessorDependencies,
    ) {
      const created = processor.createResumeUploadBatchProcessor(dependencies);
      return {
        processBatchItem: bind(created.processBatchItem),
        processNextItem: bind(created.processNextItem),
      };
    },
    defaultResumeUploadBatchProcessorDependencies:
      processor.defaultResumeUploadBatchProcessorDependencies,
    deleteBatch: bind(batches.deleteBatch),
    getClaimMissRetryError: processor.getClaimMissRetryError,
    insertBatchWithItems: bind(batches.insertBatchWithItems),
    listBatches: bind(batches.listBatches),
    loadActiveBatch: bind(batches.loadActiveBatch),
    loadActiveBatches: bind(batches.loadActiveBatches),
    loadBatchDetail: bind(batches.loadBatchDetail),
    processBatchItem,
    processNextItem,
    reconcileBatchProgress: bind(batches.reconcileBatchProgress),
    recoverIncompleteBatchItems: bind(batches.recoverIncompleteBatchItems),
    reviveOrphans: bind(batches.reviveOrphans),
    reviveRetriableFailures: bind(batches.reviveRetriableFailures),
    runBulkResumeUploadWorkflow: bind(
      (
        input: Parameters<typeof workflow.runBulkResumeUploadWorkflow>[0],
        selectedWorkflow: Parameters<
          typeof workflow.runBulkResumeUploadWorkflow
        >[1] = bulkResumeUploadWorkflow,
      ) => workflow.runBulkResumeUploadWorkflow(input, selectedWorkflow),
    ),
    toBatchDto: batches.toBatchDto,
    toItemDto: batches.toItemDto,
  };
}

export type ResumeIngest = ReturnType<typeof createResumeIngest>;
