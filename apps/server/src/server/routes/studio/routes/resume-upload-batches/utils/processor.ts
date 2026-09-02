import { db } from "@server/lib/server/db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/ingest";

configureResumeProcessingDatabase(db);

export {
  createResumeUploadBatchProcessor,
  defaultResumeUploadBatchProcessorDependencies,
  getClaimMissRetryError,
  processBatchItem,
  processNextItem,
  toBatchDto,
} from "@app/resume-processing/ingest";
export type { ResumeUploadBatchProcessorDependencies } from "@app/resume-processing/ingest";
