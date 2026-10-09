export {
  aggregateDuplicateMatchSummaries,
  deleteDuplicateMatchesForSource,
  isDuplicateMatchVisibleToSource,
  listActiveDuplicateMatchCounts,
  listActiveDuplicateSummariesAgainstStudioInterviews,
  listActiveStudioDuplicateMatchSummaries,
  listDuplicateMatchesForSource,
  replaceDuplicateMatchesForSource,
  resolveDuplicateMatchRows,
  toDuplicateMatchInsertRows,
} from "../../../semantic/resume/duplicate-matches";
export type {
  PersistDuplicateMatchesInput,
  ResolvedDuplicateMatch,
} from "../../../semantic/resume/duplicate-matches";
