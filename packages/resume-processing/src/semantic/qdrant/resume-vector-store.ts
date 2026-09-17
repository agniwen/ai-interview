import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { z } from "zod";
import type {
  ResumeEmbeddingDeleteInput,
  ResumeEmbeddingLoadInput,
  ResumeEmbeddingUpsertInput,
  ResumeSemanticSourceType,
  ResumeStoredEmbeddingChunk,
  ResumeVectorSearchInput,
  ResumeVectorSearchResult,
  ResumeVectorStore,
  ResumeVectorReadStore,
} from "../resume/vector-store";
type QdrantClientLike = Pick<
  QdrantClient,
  | "collectionExists"
  | "createCollection"
  | "createPayloadIndex"
  | "delete"
  | "getCollection"
  | "query"
  | "scroll"
  | "upsert"
>;

interface QdrantStoreOptions {
  apiKey?: string | null;
  client?: QdrantClientLike;
  collectionName?: string;
  dimensions: number;
  url: string;
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

const chunkTypeSchema = z.enum(["resume_overview", "work_project", "skill_role"]);
const sourceTypeSchema = z
  .enum(["studio_interview", "recruiting_record", "resume_pool_item", "job_description"])
  .transform((value) => (value === "recruiting_record" ? ("studio_interview" as const) : value));
const searchResponseSchema = z.object({
  points: z
    .array(
      z.object({
        payload: z
          .object({
            chunkType: chunkTypeSchema,
            sourceId: z.string(),
            sourceType: sourceTypeSchema,
          })
          .nullable(),
        score: z.number(),
      }),
    )
    .optional(),
});
const scrollResponseSchema = z.object({
  points: z
    .array(
      z.object({
        payload: z
          .object({
            chunkType: chunkTypeSchema,
            contentHash: z.string().nullable().optional(),
            embeddingModel: z.string(),
            embeddingVersion: z.string(),
            organizationId: z.string(),
            profileHash: z.string(),
            sourceId: z.string(),
            sourceType: sourceTypeSchema,
            status: z.enum(["active", "archived"]),
          })
          .nullable(),
        vector: z.array(z.number()),
      }),
    )
    .optional(),
});

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

export function isSourceType(value: unknown): value is ResumeSemanticSourceType {
  return (
    value === "studio_interview" || value === "resume_pool_item" || value === "job_description"
  );
}

function nullableString(value: string | null | undefined): string | null {
  return value ?? null;
}

export class QdrantResumeVectorStore implements ResumeVectorStore, ResumeVectorReadStore {
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

  async hasCollection(): Promise<boolean> {
    const res = await this.client.collectionExists(this.collectionName);
    return res.exists === true;
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

    const response = await this.client.query(this.collectionName, {
      filter: {
        must,
      },
      limit: input.limit,
      query: input.embedding,
      with_payload: true,
    });
    const body = searchResponseSchema.parse(response);
    return (body.points ?? []).flatMap((point) => {
      const { payload } = point;
      if (!payload) {
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

  async loadResumeEmbeddings(
    input: ResumeEmbeddingLoadInput,
  ): Promise<ResumeStoredEmbeddingChunk[]> {
    const response = await this.client.scroll(this.collectionName, {
      filter: {
        must: [
          mustMatch("organizationId", input.organizationId),
          mustMatch("sourceType", input.sourceType),
          mustMatch("sourceId", input.sourceId),
          mustMatch("embeddingVersion", input.embeddingVersion),
        ],
      },
      limit: 10,
      with_payload: true,
      with_vector: true,
    });
    const body = scrollResponseSchema.parse(response);
    return (body.points ?? []).flatMap((point) => {
      const { payload } = point;
      if (!payload) {
        return [];
      }
      return [
        {
          chunkType: payload.chunkType,
          contentHash: nullableString(payload.contentHash),
          embedding: point.vector,
          embeddingModel: payload.embeddingModel,
          embeddingVersion: payload.embeddingVersion,
          organizationId: payload.organizationId,
          profileHash: payload.profileHash,
          sourceId: payload.sourceId,
          sourceType: payload.sourceType,
          status: payload.status,
        },
      ];
    });
  }

  async deleteResumeEmbeddings(input: ResumeEmbeddingDeleteInput): Promise<void> {
    const must = [
      mustMatch("sourceType", input.sourceType),
      mustMatch("sourceId", input.sourceId),
      ...(input.organizationId ? [mustMatch("organizationId", input.organizationId)] : []),
      ...(input.embeddingVersion ? [mustMatch("embeddingVersion", input.embeddingVersion)] : []),
    ];
    await this.client.delete(this.collectionName, {
      filter: { must },
      wait: true,
    });
  }
}
