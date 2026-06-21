import { describe, expect, it, vi } from "vitest";
import { QdrantResumeVectorStore } from "../qdrant/resume-vector-store";

describe("QdrantResumeVectorStore", () => {
  it("creates the collection when it is missing", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue(false),
      createCollection: vi.fn(),
      createPayloadIndex: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn().mockResolvedValue({ payload_schema: {} }),
      query: vi.fn(),
      upsert: vi.fn(),
    };
    const store = new QdrantResumeVectorStore({
      client,
      collectionName: "resume_semantic_v1",
      dimensions: 1024,
      url: "https://qdrant.example",
    });

    await store.ensureCollection();

    expect(client.collectionExists).toHaveBeenCalledWith("resume_semantic_v1");
    expect(client.createCollection).toHaveBeenCalledWith("resume_semantic_v1", {
      vectors: { distance: "Cosine", size: 1024 },
    });
  });

  it("ensures keyword payload indexes for filtered fields when collection exists", async () => {
    const client = {
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
      createPayloadIndex: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn().mockResolvedValue({ payload_schema: {} }),
      query: vi.fn(),
      upsert: vi.fn(),
    };
    const store = new QdrantResumeVectorStore({
      client,
      collectionName: "resume_semantic_v1",
      dimensions: 1024,
      url: "https://qdrant.example",
    });

    await store.ensureCollection();

    expect(client.createCollection).not.toHaveBeenCalled();
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "organizationId",
      field_schema: "keyword",
      wait: true,
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "chunkType",
      field_schema: "keyword",
      wait: true,
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "embeddingVersion",
      field_schema: "keyword",
      wait: true,
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "sourceId",
      field_schema: "keyword",
      wait: true,
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "sourceType",
      field_schema: "keyword",
      wait: true,
    });
    expect(client.createPayloadIndex).toHaveBeenCalledWith("resume_semantic_v1", {
      field_name: "status",
      field_schema: "keyword",
      wait: true,
    });
  });

  it("upserts stable point ids with minimal payload", async () => {
    const client = {
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
      createPayloadIndex: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn(),
      query: vi.fn(),
      upsert: vi.fn(),
    };
    const store = new QdrantResumeVectorStore({
      client,
      collectionName: "resume_semantic_v1",
      dimensions: 3,
      url: "https://qdrant.example/",
    });

    await store.upsertResumeEmbeddings({
      chunks: [
        {
          chunkType: "work_project",
          embedding: [0.1, 0.2, 0.3],
          text: "work",
        },
      ],
      contentHash: "hash",
      embeddingModel: "text-embedding-v4",
      embeddingVersion: "v1",
      organizationId: "org-1",
      profileHash: "profile-hash",
      sourceId: "candidate-1",
      sourceType: "studio_interview",
      status: "active",
    });

    expect(client.upsert).toHaveBeenCalledWith(
      "resume_semantic_v1",
      expect.objectContaining({ wait: true }),
    );
    const points = client.upsert.mock.calls[0]?.[1]?.points;
    expect(points[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    expect(points[0].payload).toEqual({
      chunkType: "work_project",
      contentHash: "hash",
      embeddingModel: "text-embedding-v4",
      embeddingVersion: "v1",
      organizationId: "org-1",
      profileHash: "profile-hash",
      sourceId: "candidate-1",
      sourceType: "studio_interview",
      status: "active",
    });
  });

  it("searches with organization, status, and chunk filters", async () => {
    const client = {
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
      createPayloadIndex: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn(),
      query: vi.fn().mockResolvedValue({
        points: [
          {
            id: "point-1",
            payload: {
              chunkType: "work_project",
              sourceId: "candidate-1",
              sourceType: "studio_interview",
            },
            score: 0.92,
          },
        ],
      }),
      upsert: vi.fn(),
    };
    const store = new QdrantResumeVectorStore({
      client,
      collectionName: "resume_semantic_v1",
      dimensions: 3,
      url: "https://qdrant.example",
    });

    const results = await store.searchSimilarResumes({
      chunkType: "work_project",
      embedding: [0.1, 0.2, 0.3],
      limit: 20,
      organizationId: "org-1",
    });

    expect(results).toEqual([
      {
        chunkType: "work_project",
        score: 0.92,
        sourceId: "candidate-1",
        sourceType: "studio_interview",
      },
    ]);
    const queryOptions = client.query.mock.calls[0]?.[1];
    expect(queryOptions.filter.must).toContainEqual({
      key: "organizationId",
      match: { value: "org-1" },
    });
    expect(queryOptions.filter.must).toContainEqual({
      key: "chunkType",
      match: { value: "work_project" },
    });
  });

  it("adds source type filters when searching similar resumes", async () => {
    const client = {
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
      createPayloadIndex: vi.fn(),
      delete: vi.fn(),
      getCollection: vi.fn(),
      query: vi.fn().mockResolvedValue({ points: [] }),
      upsert: vi.fn(),
    };
    const store = new QdrantResumeVectorStore({
      client,
      collectionName: "resume_semantic_v1",
      dimensions: 3,
      url: "https://qdrant.example",
    });

    await store.searchSimilarResumes({
      chunkType: "skill_role",
      embedding: [0.1, 0.2, 0.3],
      limit: 20,
      organizationId: "org-1",
      sourceTypes: ["studio_interview"],
    });

    const queryOptions = client.query.mock.calls[0]?.[1];
    expect(queryOptions.filter.must).toContainEqual({
      key: "sourceType",
      match: { any: ["studio_interview"] },
    });
  });
});
