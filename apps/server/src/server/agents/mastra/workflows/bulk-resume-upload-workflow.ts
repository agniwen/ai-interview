import { db } from "@server/lib/server/db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/ingest";

configureResumeProcessingDatabase(db);

export {
  bulkResumeUploadWorkflow,
  createBulkResumeUploadWorkflow,
  runBulkResumeUploadWorkflow,
} from "@app/resume-processing/ingest";
export type {
  BulkResumeUploadWorkflowDeps,
  BulkResumeUploadWorkflowOutput,
} from "@app/resume-processing/ingest";
