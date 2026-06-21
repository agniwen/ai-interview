import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Schemas } from "@qdrant/js-client-rest";
import type {
  ResumeEmbeddingDeleteInput,
  ResumeEmbeddingUpsertInput,
  ResumeSemanticSourceType,
  ResumeVectorSearchInput,
  ResumeVectorSearchResult,
  ResumeVectorStore,
} from "../resume-semantic/vector-store";
import type { ResumeSemanticChunkType } from "../resume-semantic/text-builders";

type QdrantPointId = string | number;

interface QdrantClientLike {
  collectionExists(collectionName: string): Promise<{ exists?: boolean }>;
  createCollection(
    collectionName: string,
    input: { vectors: { distance: "Cosine"; size: number } },
  ): Promise<unknown>;
  createPayloadIndex(
    collectionName: string,
    input: { field_name: string; field_schema: "keyword"; wait: true },
  ): Promise<unknown>;
  delete(
    collectionName: string,
    input: { filter: { must: ReturnType<typeof mustMatch>[] }; wait: true },
  ): Promise<unknown>;
  getCollection(collectionName: string): Promise<{ payload_schema?: Record<string, unknown> }>;
  query(
    collectionName: string,
    input: {
      filter: { must: QdrantFilterCondition[] };
      limit: number;
      query: number[];
      with_payload: true;
    },
  ): Promise<{ points?: QdrantSearchPoint[] }>;
  upsert(
    collectionName: string,
    input: { points: QdrantUpsertPoint[]; wait: true },
  ): Promise<unknown>;
}

interface QdrantStoreOptions {
  apiKey?: string | null;
  client?: QdrantClientLike;
  collectionName?: string;
  dimensions: number;
  url: string;
}

interface QdrantUpsertPoint {
  id: QdrantPointId;
  payload: Schemas["Payload"];
  vector: number[];
}

interface QdrantSearchPoint {
  payload?: {
    chunkType?: unknown;
    sourceId?: unknown;
    sourceType?: unknown;
  } | null;
  score?: unknown;
}

const FILTER_PAYLOAD_FIELDS = [
  "chunkType",
  "embeddingVersion",
  "organizationId",
  "sourceId",
  "sourceType",
  "status",
] as const;

type QdrantFilterCondition = ReturnType<typeof mustMatch> | ReturnType<typeof mustMatchAny>;

function pointUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}

function mustMatch(key: string, value: string) {
  return { key, match: { value } };
}

function mustMatchAny(key: string, values: string[]) {
  return { key, match: { any: values } };
}

function isChunkType(value: unknown): value is ResumeSemanticChunkType {
  return value === "resume_overview" || value === "work_project" || value === "skill_role";
}

function isSourceType(value: unknown): value is ResumeSemanticSourceType {
  return value === "studio_interview" || value === "resume_pool_item";
}

export class QdrantResumeVectorStore implements ResumeVectorStore {
  private readonly client: QdrantClientLike;
  private readonly collectionName: string;
  private readonly dimensions: number;

  constructor({
    apiKey = null,
    client,
    collectionName = "resume_semantic_v1",
    dimensions,
    url,
  }: QdrantStoreOptions) {
    this.client =
      client ??
      new QdrantClient({
        apiKey: apiKey ?? undefined,
        checkCompatibility: false,
        url,
      });
    this.collectionName = collectionName;
    this.dimensions = dimensions;
  }

  async ensureCollection(): Promise<void> {
    const existing = await this.client.collectionExists(this.collectionName);
    if (!existing.exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          distance: "Cosine",
          size: this.dimensions,
        },
      });
    }

    const collection = await this.client.getCollection(this.collectionName);
    const payloadSchema = collection.payload_schema ?? {};
    await Promise.all(
      FILTER_PAYLOAD_FIELDS.filter((fieldName) => !(fieldName in payloadSchema)).map((fieldName) =>
        this.client.createPayloadIndex(this.collectionName, {
          field_name: fieldName,
          field_schema: "keyword",
          wait: true,
        }),
      ),
    );
  }

  async upsertResumeEmbeddings(input: ResumeEmbeddingUpsertInput): Promise<void> {
    if (input.chunks.length === 0) {
      return;
    }
    const points = input.chunks.map((chunk) => ({
      id: pointUuid(
        `${input.sourceType}:${input.sourceId}:${chunk.chunkType}:${input.embeddingVersion}`,
      ),
      payload: {
        chunkType: chunk.chunkType,
        contentHash: input.contentHash,
        embeddingModel: input.embeddingModel,
        embeddingVersion: input.embeddingVersion,
        organizationId: input.organizationId,
        profileHash: input.profileHash,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        status: input.status,
      },
      vector: chunk.embedding,
    }));
    await this.client.upsert(this.collectionName, { points, wait: true });
  }

  async searchSimilarResumes(input: ResumeVectorSearchInput): Promise<ResumeVectorSearchResult[]> {
    const must: QdrantFilterCondition[] = [
      mustMatch("organizationId", input.organizationId),
      mustMatch("chunkType", input.chunkType),
      mustMatch("status", "active"),
    ];
    if (input.sourceTypes && input.sourceTypes.length > 0) {
      must.push(mustMatchAny("sourceType", input.sourceTypes));
    }

    const body = await this.client.query(this.collectionName, {
      filter: {
        must,
      },
      limit: input.limit,
      query: input.embedding,
      with_payload: true,
    });
    return (body.points ?? []).flatMap((point) => {
      const { payload } = point;
      if (
        !payload ||
        !isChunkType(payload.chunkType) ||
        !isSourceType(payload.sourceType) ||
        typeof payload.sourceId !== "string" ||
        typeof point.score !== "number"
      ) {
        return [];
      }
      return [
        {
          chunkType: payload.chunkType,
          score: point.score,
          sourceId: payload.sourceId,
          sourceType: payload.sourceType,
        },
      ];
    });
  }

  async deleteResumeEmbeddings(input: ResumeEmbeddingDeleteInput): Promise<void> {
    const must = [
      mustMatch("sourceType", input.sourceType),
      mustMatch("sourceId", input.sourceId),
      ...(input.embeddingVersion ? [mustMatch("embeddingVersion", input.embeddingVersion)] : []),
    ];
    await this.client.delete(this.collectionName, {
      filter: { must },
      wait: true,
    });
  }
}
