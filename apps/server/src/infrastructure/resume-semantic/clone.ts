import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";
import { db } from "../db/index";

const semantic = createResumeSemanticProcessing(db);

export const cloneResumeSemanticIndexFromPoolToInterview: ResumeSemanticProcessing["cloneResumeSemanticIndexFromPoolToInterview"] =
  semantic.cloneResumeSemanticIndexFromPoolToInterview;
