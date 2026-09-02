import { db } from "../db";
import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";

export const {
  listRecoverableResumeSemanticIndexJobs,
  runJdSemanticIndexJob,
  runResumeSemanticEnrichmentJob,
} = createResumeSemanticProcessing(db);
