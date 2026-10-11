import { db } from "../db/index";
import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";

const semantic = createResumeSemanticProcessing(db);
export const getResumeSemanticIndexConfig: ResumeSemanticProcessing["getResumeSemanticIndexConfig"] =
  semantic.getResumeSemanticIndexConfig;
export const prepareResumeSemanticIndexJob: ResumeSemanticProcessing["prepareResumeSemanticIndexJob"] =
  semantic.prepareResumeSemanticIndexJob;
export const runResumeSemanticIndexJob: ResumeSemanticProcessing["runResumeSemanticIndexJob"] =
  semantic.runResumeSemanticIndexJob;
export const upsertResumeSemanticIndexState: ResumeSemanticProcessing["upsertResumeSemanticIndexState"] =
  semantic.upsertResumeSemanticIndexState;
