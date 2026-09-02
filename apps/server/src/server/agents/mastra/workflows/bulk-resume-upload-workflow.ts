import { db } from "../../../../lib/server/db/index";
import { createBulkResumeUploadWorkflow, createResumeIngest } from "@app/resume-processing/ingest";
import type { ResumeIngest } from "@app/resume-processing/ingest";

const ingest = createResumeIngest(db);

export const bulkResumeUploadWorkflow: ResumeIngest["bulkResumeUploadWorkflow"] =
  ingest.bulkResumeUploadWorkflow;
export const runBulkResumeUploadWorkflow: ResumeIngest["runBulkResumeUploadWorkflow"] =
  ingest.runBulkResumeUploadWorkflow;
export { createBulkResumeUploadWorkflow };
export type {
  BulkResumeUploadWorkflowDeps,
  BulkResumeUploadWorkflowOutput,
} from "@app/resume-processing/ingest";
