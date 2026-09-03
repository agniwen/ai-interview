import { createResumeSemanticProcessing } from "@app/resume-processing/semantic";
import type { ResumeSemanticProcessing } from "@app/resume-processing/semantic";
import { db } from "../db/index";

const semantic = createResumeSemanticProcessing(db);

export {
  aggregateDuplicateMatchSummaries,
  isDuplicateMatchVisibleToSource,
  resolveDuplicateMatchRows,
  toDuplicateMatchInsertRows,
} from "@app/resume-processing/semantic";
export type {
  PersistDuplicateMatchesInput,
  ResolvedDuplicateMatch,
} from "@app/resume-processing/semantic";

export const deleteDuplicateMatchesForSource: ResumeSemanticProcessing["deleteDuplicateMatchesForSource"] =
  semantic.deleteDuplicateMatchesForSource;
export const listActiveDuplicateMatchCounts: ResumeSemanticProcessing["listActiveDuplicateMatchCounts"] =
  semantic.listActiveDuplicateMatchCounts;
export const listActiveDuplicateSummariesAgainstStudioInterviews: ResumeSemanticProcessing["listActiveDuplicateSummariesAgainstStudioInterviews"] =
  semantic.listActiveDuplicateSummariesAgainstStudioInterviews;
export const listActiveStudioDuplicateMatchSummaries: ResumeSemanticProcessing["listActiveStudioDuplicateMatchSummaries"] =
  semantic.listActiveStudioDuplicateMatchSummaries;
export const listDuplicateMatchesForSource: ResumeSemanticProcessing["listDuplicateMatchesForSource"] =
  semantic.listDuplicateMatchesForSource;
export const replaceDuplicateMatchesForSource: ResumeSemanticProcessing["replaceDuplicateMatchesForSource"] =
  semantic.replaceDuplicateMatchesForSource;
