import { db } from "../db/index";
import { configureResumeProcessingDatabase } from "@app/resume-processing/semantic";

configureResumeProcessingDatabase(db);

export { runResumeSemanticEnrichmentJob } from "@app/resume-processing/semantic";
