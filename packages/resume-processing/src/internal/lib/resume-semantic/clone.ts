import { and, eq } from "drizzle-orm";
import { resumeSemanticIndex } from "@app/db-schema/schema";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";
import { getResumeEmbeddingConfig } from "../../../semantic/resume/embedding";
import type {
  ResumeSemanticSourceType,
  ResumeStoredEmbeddingChunk,
  ResumeVectorReadStore,
  ResumeVectorStore,
} from "../../../semantic/resume/vector-store";
import type { ResumeSemanticChunkType } from "../../../semantic/resume/text-builders";

interface CloneResumeSemanticIndexInput {
  organizationId?: string;
  poolItemId: string;
  resumeRecordId: string;
  sourceOrganizationId?: string;
  targetOrganizationId?: string;
}

interface SourceIndexState {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  profileHash: string;
  status: string;
}

interface LoadSourceIndexStateInput {
  embeddingVersion: string;
  organizationId: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}

interface MarkIndexedInput {
  contentHash: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  organizationId: string;
  profileHash: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}

interface CloneResumeSemanticIndexDeps {
  getEmbeddingVersion: () => string;
  loadSourceIndexState: (input: LoadSourceIndexStateInput) => Promise<SourceIndexState | null>;
  markIndexed: (input: MarkIndexedInput) => Promise<void> | void;
  vectorStore: Pick<ResumeVectorStore, "upsertResumeEmbeddings"> & ResumeVectorReadStore;
}

const REQUIRED_CHUNK_TYPES: ResumeSemanticChunkType[] = [
  "resume_overview",
  "work_project",
  "skill_role",
];

async function loadSemanticIndexState(
  input: LoadSourceIndexStateInput,
): Promise<SourceIndexState | null> {
  const { db } = await import("../db");
  const [row] = await db
    .select({
      contentHash: resumeSemanticIndex.contentHash,
      embeddingModel: resumeSemanticIndex.embeddingModel,
      embeddingVersion: resumeSemanticIndex.embeddingVersion,
      profileHash: resumeSemanticIndex.profileHash,
      status: resumeSemanticIndex.status,
    })
    .from(resumeSemanticIndex)
    .where(
      and(
        eq(resumeSemanticIndex.organizationId, input.organizationId),
        eq(resumeSemanticIndex.sourceType, input.sourceType),
        eq(resumeSemanticIndex.sourceId, input.sourceId),
        eq(resumeSemanticIndex.embeddingVersion, input.embeddingVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}

function createDefaultCloneDeps(): CloneResumeSemanticIndexDeps {
  const embedding = getResumeEmbeddingConfig();
  const qdrantUrl = process.env.QDRANT_URL || "";
  if (!qdrantUrl) {
    throw new Error("QDRANT_URL is not configured.");
  }
  const embeddingVersion =
    process.env.RESUME_EMBEDDING_VERSION || "dashscope-text-embedding-v4-1024-v1";
  return {
    getEmbeddingVersion: () => embeddingVersion,
    loadSourceIndexState: loadSemanticIndexState,
    markIndexed: async (input) => {
      const { upsertResumeSemanticIndexState } = await import("./indexer");
      await upsertResumeSemanticIndexState({ ...input, errorMessage: null, status: "indexed" });
    },
    vectorStore: new QdrantResumeVectorStore({
      apiKey: process.env.QDRANT_API_KEY || null,
      collectionName: process.env.QDRANT_RESUME_COLLECTION || "resume_semantic_v1",
      dimensions: embedding.dimensions,
      url: qdrantUrl,
    }),
  };
}

function chunkMap(chunks: ResumeStoredEmbeddingChunk[]) {
  return new Map(chunks.map((chunk) => [chunk.chunkType, chunk]));
}

function validateLoadedChunks({
  chunks,
  expected,
  organizationId,
  sourceId,
  sourceType,
}: {
  chunks: ResumeStoredEmbeddingChunk[];
  expected: SourceIndexState;
  organizationId: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}): Map<ResumeSemanticChunkType, ResumeStoredEmbeddingChunk> {
  const byChunkType = chunkMap(chunks);
  if (REQUIRED_CHUNK_TYPES.some((chunkType) => !byChunkType.has(chunkType))) {
    throw new Error("resume pool semantic vectors are incomplete.");
  }
  for (const chunk of byChunkType.values()) {
    if (
      chunk.organizationId !== organizationId ||
      chunk.sourceId !== sourceId ||
      chunk.sourceType !== sourceType ||
      chunk.embeddingVersion !== expected.embeddingVersion ||
      chunk.profileHash !== expected.profileHash
    ) {
      throw new Error("resume pool semantic vectors do not match index state.");
    }
  }
  return byChunkType;
}

function requireChunk(
  chunks: Map<ResumeSemanticChunkType, ResumeStoredEmbeddingChunk>,
  chunkType: ResumeSemanticChunkType,
): ResumeStoredEmbeddingChunk {
  const chunk = chunks.get(chunkType);
  if (!chunk) {
    throw new Error("resume pool semantic vectors are incomplete.");
  }
  return chunk;
}

export async function cloneResumeSemanticIndexFromPoolToInterview(
  input: CloneResumeSemanticIndexInput,
  deps: CloneResumeSemanticIndexDeps = createDefaultCloneDeps(),
): Promise<void> {
  const embeddingVersion = deps.getEmbeddingVersion();
  const sourceOrganizationId = input.sourceOrganizationId ?? input.organizationId;
  const targetOrganizationId = input.targetOrganizationId ?? input.organizationId;
  if (!sourceOrganizationId || !targetOrganizationId) {
    throw new Error("resume semantic clone organization ids are required.");
  }
  const sourceState = await deps.loadSourceIndexState({
    embeddingVersion,
    organizationId: sourceOrganizationId,
    sourceId: input.poolItemId,
    sourceType: "resume_pool_item",
  });
  if (!sourceState || sourceState.status !== "indexed") {
    throw new Error("resume pool semantic index is not ready.");
  }
  const loadedChunks = await deps.vectorStore.loadResumeEmbeddings({
    embeddingVersion,
    organizationId: sourceOrganizationId,
    sourceId: input.poolItemId,
    sourceType: "resume_pool_item",
  });
  const byChunkType = validateLoadedChunks({
    chunks: loadedChunks,
    expected: sourceState,
    organizationId: sourceOrganizationId,
    sourceId: input.poolItemId,
    sourceType: "resume_pool_item",
  });
  await deps.vectorStore.upsertResumeEmbeddings({
    chunks: REQUIRED_CHUNK_TYPES.map((chunkType) => {
      const chunk = requireChunk(byChunkType, chunkType);
      return {
        chunkType,
        embedding: chunk.embedding,
        text: "",
      };
    }),
    contentHash: sourceState.contentHash,
    embeddingModel: sourceState.embeddingModel,
    embeddingVersion: sourceState.embeddingVersion,
    organizationId: targetOrganizationId,
    profileHash: sourceState.profileHash,
    sourceId: input.resumeRecordId,
    sourceType: "studio_interview",
    status: "active",
  });
  await deps.markIndexed({
    contentHash: sourceState.contentHash,
    embeddingModel: sourceState.embeddingModel,
    embeddingVersion: sourceState.embeddingVersion,
    organizationId: targetOrganizationId,
    profileHash: sourceState.profileHash,
    sourceId: input.resumeRecordId,
    sourceType: "studio_interview",
  });
}
