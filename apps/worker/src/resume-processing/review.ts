import { db } from "../db";
import { configureResumeProcessingDatabase } from "@app/resume-processing/review";

configureResumeProcessingDatabase(db);

export { processResumeReviewGenerationJob } from "@app/resume-processing/review";
