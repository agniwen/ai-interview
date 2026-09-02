import { db } from "../db";
import { createResumeIngest } from "@app/resume-processing/ingest";

export const { recoverIncompleteBatchItems, runBulkResumeUploadWorkflow } = createResumeIngest(db);
