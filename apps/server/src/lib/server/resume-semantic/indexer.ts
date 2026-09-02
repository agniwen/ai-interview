import { db } from "../db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/semantic";

configureResumeProcessingDatabase(db);

export {
  createDefaultIndexerDeps,
  getResumeSemanticIndexConfig,
  listRecoverableResumeSemanticIndexJobs,
  prepareResumeSemanticIndexJob,
  runResumeSemanticIndexJob,
  upsertResumeSemanticIndexState,
} from "@app/resume-processing/semantic";
