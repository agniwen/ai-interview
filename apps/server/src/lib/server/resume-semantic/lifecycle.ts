import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";
import { db } from "../db/index";

const semantic = createResumeSemanticProcessing(db);

export const deleteResumeSemanticIndex: ResumeSemanticProcessing["deleteResumeSemanticIndex"] =
  semantic.deleteResumeSemanticIndex;
export const deleteResumeSemanticIndexBestEffort: ResumeSemanticProcessing["deleteResumeSemanticIndexBestEffort"] =
  semantic.deleteResumeSemanticIndexBestEffort;
