import { db } from "../db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/semantic";

configureResumeProcessingDatabase(db);

export {
  createDefaultJdIndexerDeps,
  prepareJdSemanticIndexJob,
  runJdSemanticIndexJob,
} from "@app/resume-processing/semantic";
export type { JdIndexerDeps, JdSemanticIndexJob } from "@app/resume-processing/semantic";
