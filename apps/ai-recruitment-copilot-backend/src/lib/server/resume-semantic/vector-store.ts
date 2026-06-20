import type { ResumeSemanticChunkType } from "./text-builders";

export type ResumeSemanticSourceType = "resume_pool_item" | "studio_interview";
export type ResumeVectorPayloadStatus = "active" | "archived";

export interface ResumeEmbeddingChunk {
  chunkType: ResumeSemanticChunkType;
  embedding: number[];
  text: string;
}

export interface ResumeEmbeddingUpsertInput {
  chunks: ResumeEmbeddingChunk[];
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  organizationId: string;
  profileHash: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
  status: ResumeVectorPayloadStatus;
}

export interface ResumeVectorSearchInput {
  chunkType: ResumeSemanticChunkType;
  embedding: number[];
  limit: number;
  organizationId: string;
}

export interface ResumeVectorSearchResult {
  chunkType: ResumeSemanticChunkType;
  score: number;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}

export interface ResumeEmbeddingDeleteInput {
  embeddingVersion?: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}

export interface ResumeVectorStore {
  deleteResumeEmbeddings(input: ResumeEmbeddingDeleteInput): Promise<void>;
  ensureCollection(): Promise<void>;
  searchSimilarResumes(input: ResumeVectorSearchInput): Promise<ResumeVectorSearchResult[]>;
  upsertResumeEmbeddings(input: ResumeEmbeddingUpsertInput): Promise<void>;
}
