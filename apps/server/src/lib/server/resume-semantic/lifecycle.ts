import { and, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { resumeSemanticIndex } from "@arc/db-schema/schema";
import type { ResumeSemanticSourceType, ResumeVectorStore } from "./vector-store";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";
import { getResumeSemanticIndexConfig } from "./indexer";

interface DeleteResumeSemanticIndexInput {
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}

interface DeleteResumeSemanticIndexDeps {
  deleteIndexState: (input: {
    embeddingVersion: string;
    sourceId: string;
    sourceType: ResumeSemanticSourceType;
  }) => Promise<void> | void;
  getEmbeddingVersion: () => string;
  vectorStore: Pick<ResumeVectorStore, "deleteResumeEmbeddings">;
}

async function deleteSemanticIndexState(input: {
  embeddingVersion: string;
  sourceId: string;
  sourceType: ResumeSemanticSourceType;
}): Promise<void> {
  await db
    .delete(resumeSemanticIndex)
    .where(
      and(
        eq(resumeSemanticIndex.sourceType, input.sourceType),
        eq(resumeSemanticIndex.sourceId, input.sourceId),
        eq(resumeSemanticIndex.embeddingVersion, input.embeddingVersion),
      ),
    );
}

function createDefaultDeleteDeps(): DeleteResumeSemanticIndexDeps {
  const config = getResumeSemanticIndexConfig();
  if (!config.qdrantUrl) {
    throw new Error("QDRANT_URL is not configured.");
  }
  return {
    deleteIndexState: deleteSemanticIndexState,
    getEmbeddingVersion: () => config.embeddingVersion,
    vectorStore: new QdrantResumeVectorStore({
      apiKey: config.qdrantApiKey,
      collectionName: config.qdrantCollectionName,
      dimensions: config.dimensions,
      url: config.qdrantUrl,
    }),
  };
}

export async function deleteResumeSemanticIndex(
  input: DeleteResumeSemanticIndexInput,
  deps: DeleteResumeSemanticIndexDeps = createDefaultDeleteDeps(),
): Promise<void> {
  const embeddingVersion = deps.getEmbeddingVersion();
  await deps.vectorStore.deleteResumeEmbeddings({
    embeddingVersion,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
  });
  await deps.deleteIndexState({
    embeddingVersion,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
  });
}

export async function deleteResumeSemanticIndexBestEffort(
  input: DeleteResumeSemanticIndexInput,
): Promise<void> {
  try {
    await deleteResumeSemanticIndex(input);
  } catch (error) {
    console.warn("[resume-semantic-index] delete failed", {
      error,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
    });
  }
}
