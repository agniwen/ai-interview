import type { Database } from "@app/database";
import { bindResumeProcessingDatabase, withResumeProcessingDatabase } from "./database";
import * as clone from "./internal/lib/resume-semantic/clone";
import * as enqueue from "./internal/lib/resume-semantic/enqueue";
import * as lifecycle from "./internal/lib/resume-semantic/lifecycle";
import * as jdIndexer from "./semantic/jd/indexer";
import * as dedup from "./semantic/resume/dedup-service";
import * as duplicateMatches from "./semantic/resume/duplicate-matches";
import * as resumeEnrichment from "./semantic/resume/enrichment";
import * as resumeIndexer from "./semantic/resume/indexer";

export { hashJobDescriptionForSemanticIndex } from "./semantic/jd/hash";
export { QdrantResumeVectorStore, isSourceType } from "./semantic/qdrant/resume-vector-store";
export {
  embedResumeSemanticTexts,
  getResumeEmbeddingConfig,
  isResumeSemanticIndexEnabled,
} from "./semantic/resume/embedding";
export { hashResumeProfileForSemanticIndex } from "./semantic/resume/profile-hash";
export { rerankResumeDuplicate } from "./semantic/resume/rerank";
export type {
  ResumeDuplicateRerankInput,
  ResumeDuplicateRerankResult,
  VectorSimilarityScores,
} from "./semantic/resume/rerank";
export { SEARCH_LIMIT_BY_CHUNK, mergeVectorScores, weightedScore } from "./semantic/resume/scoring";
export type { VectorScores } from "./semantic/resume/scoring";
export {
  buildJobDescriptionSemanticTexts,
  buildResumeSemanticTexts,
} from "./semantic/resume/text-builders";
export type {
  JobDescriptionSemanticInput,
  ResumeSemanticChunkType,
  ResumeSemanticTextChunk,
} from "./semantic/resume/text-builders";
export type {
  ResumeEmbeddingChunk,
  ResumeEmbeddingDeleteInput,
  ResumeEmbeddingLoadInput,
  ResumeEmbeddingUpsertInput,
  ResumeSemanticSourceType,
  ResumeStoredEmbeddingChunk,
  ResumeVectorPayloadStatus,
  ResumeVectorReadStore,
  ResumeVectorSearchInput,
  ResumeVectorSearchResult,
  ResumeVectorStore,
} from "./semantic/resume/vector-store";
export type { JdIndexerDeps, JdSemanticIndexJob } from "./semantic/jd/indexer";
export {
  aggregateDuplicateMatchSummaries,
  isDuplicateMatchVisibleToSource,
  listActiveStudioDuplicateMatchSummaries,
  resolveDuplicateMatchRows,
  toDuplicateMatchInsertRows,
} from "./semantic/resume/duplicate-matches";
export type {
  PersistDuplicateMatchesInput,
  ResolvedDuplicateMatch,
} from "./semantic/resume/duplicate-matches";

function createBoundDefaultResumeIndexerDeps(database: Database) {
  const dependencies = withResumeProcessingDatabase(
    database,
    resumeIndexer.createDefaultIndexerDeps,
  );
  return {
    ...dependencies,
    loadSource: bindResumeProcessingDatabase(database, dependencies.loadSource),
    markFailed: bindResumeProcessingDatabase(database, dependencies.markFailed),
    markIndexed: bindResumeProcessingDatabase(database, dependencies.markIndexed),
    markSkipped: bindResumeProcessingDatabase(database, dependencies.markSkipped),
    readIndexState: bindResumeProcessingDatabase(database, dependencies.readIndexState),
  };
}

function createBoundDefaultJdIndexerDeps(database: Database) {
  const dependencies = withResumeProcessingDatabase(database, jdIndexer.createDefaultJdIndexerDeps);
  return {
    ...dependencies,
    loadSource: bindResumeProcessingDatabase(database, dependencies.loadSource),
    markDeleted: bindResumeProcessingDatabase(database, dependencies.markDeleted),
    markFailed: bindResumeProcessingDatabase(database, dependencies.markFailed),
    markIndexed: bindResumeProcessingDatabase(database, dependencies.markIndexed),
    readIndexState: bindResumeProcessingDatabase(database, dependencies.readIndexState),
  };
}

export function createResumeSemanticProcessing(database: Database) {
  return {
    cloneResumeSemanticIndexFromPoolToInterview: bindResumeProcessingDatabase(
      database,
      clone.cloneResumeSemanticIndexFromPoolToInterview,
    ),
    createDefaultIndexerDeps: () => createBoundDefaultResumeIndexerDeps(database),
    createDefaultJdIndexerDeps: () => createBoundDefaultJdIndexerDeps(database),
    deleteDuplicateMatchesForSource: bindResumeProcessingDatabase(
      database,
      duplicateMatches.deleteDuplicateMatchesForSource,
    ),
    deleteResumeSemanticIndex: bindResumeProcessingDatabase(
      database,
      lifecycle.deleteResumeSemanticIndex,
    ),
    deleteResumeSemanticIndexBestEffort: bindResumeProcessingDatabase(
      database,
      lifecycle.deleteResumeSemanticIndexBestEffort,
    ),
    enqueueResumeSemanticIndexJobBestEffort: bindResumeProcessingDatabase(
      database,
      enqueue.enqueueResumeSemanticIndexJobBestEffort,
    ),
    findSemanticResumeDuplicates: bindResumeProcessingDatabase(
      database,
      dedup.findSemanticResumeDuplicates,
    ),
    getResumeSemanticIndexConfig: resumeIndexer.getResumeSemanticIndexConfig,
    listActiveDuplicateMatchCounts: bindResumeProcessingDatabase(
      database,
      duplicateMatches.listActiveDuplicateMatchCounts,
    ),
    listActiveDuplicateSummariesAgainstStudioInterviews: bindResumeProcessingDatabase(
      database,
      duplicateMatches.listActiveDuplicateSummariesAgainstStudioInterviews,
    ),
    listDuplicateMatchesForSource: bindResumeProcessingDatabase(
      database,
      duplicateMatches.listDuplicateMatchesForSource,
    ),
    listRecoverableResumeSemanticIndexJobs: bindResumeProcessingDatabase(
      database,
      resumeIndexer.listRecoverableResumeSemanticIndexJobs,
    ),
    prepareJdSemanticIndexJob: bindResumeProcessingDatabase(
      database,
      jdIndexer.prepareJdSemanticIndexJob,
    ),
    prepareResumeSemanticIndexJob: bindResumeProcessingDatabase(
      database,
      resumeIndexer.prepareResumeSemanticIndexJob,
    ),
    replaceDuplicateMatchesForSource: bindResumeProcessingDatabase(
      database,
      duplicateMatches.replaceDuplicateMatchesForSource,
    ),
    runJdSemanticIndexJob: bindResumeProcessingDatabase(database, jdIndexer.runJdSemanticIndexJob),
    runResumeSemanticEnrichmentJob: bindResumeProcessingDatabase(
      database,
      resumeEnrichment.runResumeSemanticEnrichmentJob,
    ),
    runResumeSemanticIndexJob: bindResumeProcessingDatabase(
      database,
      resumeIndexer.runResumeSemanticIndexJob,
    ),
    upsertResumeSemanticIndexState: bindResumeProcessingDatabase(
      database,
      resumeIndexer.upsertResumeSemanticIndexState,
    ),
  };
}

export type ResumeSemanticProcessing = ReturnType<typeof createResumeSemanticProcessing>;
