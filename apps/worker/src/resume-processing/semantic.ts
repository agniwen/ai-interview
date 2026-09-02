import { db } from "../db";
import { configureResumeProcessingDatabase } from "@app/resume-processing/semantic";

configureResumeProcessingDatabase(db);

export {
  listRecoverableResumeSemanticIndexJobs,
  runJdSemanticIndexJob,
  runResumeSemanticEnrichmentJob,
} from "@app/resume-processing/semantic";
