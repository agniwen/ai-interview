import { db } from "../db";
import { configureResumeProcessingDatabase } from "@app/resume-processing/ingest";

configureResumeProcessingDatabase(db);

export {
  recoverIncompleteBatchItems,
  runBulkResumeUploadWorkflow,
} from "@app/resume-processing/ingest";
