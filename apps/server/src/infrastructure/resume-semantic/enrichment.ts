import { db } from "../db/index";
import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";

const semantic = createResumeSemanticProcessing(db);

export const runResumeSemanticEnrichmentJob: ResumeSemanticProcessing["runResumeSemanticEnrichmentJob"] =
  semantic.runResumeSemanticEnrichmentJob;
