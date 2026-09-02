import { db } from "../db";
import { createResumeReview } from "@app/resume-processing/review";

export const { processResumeReviewGenerationJob } = createResumeReview(db);
