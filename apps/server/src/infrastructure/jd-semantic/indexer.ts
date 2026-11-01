import { db } from "../db/index";
import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";

const semantic = createResumeSemanticProcessing(db);
export const prepareJdSemanticIndexJob: ResumeSemanticProcessing["prepareJdSemanticIndexJob"] =
  semantic.prepareJdSemanticIndexJob;
export const runJdSemanticIndexJob: ResumeSemanticProcessing["runJdSemanticIndexJob"] =
  semantic.runJdSemanticIndexJob;
export type { JdIndexerDeps, JdSemanticIndexJob } from "@app/resume-processing/semantic";
