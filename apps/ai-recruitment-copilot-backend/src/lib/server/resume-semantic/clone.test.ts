import { describe, expect, it, vi } from "vitest";
import { cloneResumeSemanticIndexFromPoolToInterview } from "./clone";

const chunks = [
  {
    chunkType: "resume_overview" as const,
    contentHash: "hash",
    embedding: [0.1, 0.2],
    embeddingModel: "text-embedding-v4",
    embeddingVersion: "v1",
    organizationId: "org-1",
    profileHash: "profile-hash",
    sourceId: "pool-1",
    sourceType: "resume_pool_item" as const,
    status: "active" as const,
  },
  {
    chunkType: "work_project" as const,
    contentHash: "hash",
    embedding: [0.3, 0.4],
    embeddingModel: "text-embedding-v4",
    embeddingVersion: "v1",
    organizationId: "org-1",
    profileHash: "profile-hash",
    sourceId: "pool-1",
    sourceType: "resume_pool_item" as const,
    status: "active" as const,
  },
  {
    chunkType: "skill_role" as const,
    contentHash: "hash",
    embedding: [0.5, 0.6],
    embeddingModel: "text-embedding-v4",
    embeddingVersion: "v1",
    organizationId: "org-1",
    profileHash: "profile-hash",
    sourceId: "pool-1",
    sourceType: "resume_pool_item" as const,
    status: "active" as const,
  },
];

describe("cloneResumeSemanticIndexFromPoolToInterview", () => {
  it("copies indexed pool vectors to the imported studio interview without embedding", async () => {
    const loadSourceIndexState = vi.fn().mockResolvedValue({
      contentHash: "hash",
      embeddingModel: "text-embedding-v4",
      embeddingVersion: "v1",
      profileHash: "profile-hash",
      status: "indexed",
    });
    const markIndexed = vi.fn();
    const upsertResumeEmbeddings = vi.fn();
    const loadResumeEmbeddings = vi.fn().mockResolvedValue(chunks);

    await cloneResumeSemanticIndexFromPoolToInterview(
      {
        organizationId: "org-1",
        poolItemId: "pool-1",
        resumeRecordId: "record-1",
      },
      {
        getEmbeddingVersion: () => "v1",
        loadSourceIndexState,
        markIndexed,
        vectorStore: {
          loadResumeEmbeddings,
          upsertResumeEmbeddings,
        },
      },
    );

    expect(loadSourceIndexState).toHaveBeenCalledWith({
      embeddingVersion: "v1",
      organizationId: "org-1",
      sourceId: "pool-1",
      sourceType: "resume_pool_item",
    });
    expect(loadResumeEmbeddings).toHaveBeenCalledWith({
      embeddingVersion: "v1",
      organizationId: "org-1",
      sourceId: "pool-1",
      sourceType: "resume_pool_item",
    });
    expect(upsertResumeEmbeddings).toHaveBeenCalledWith({
      chunks: [
        { chunkType: "resume_overview", embedding: [0.1, 0.2], text: "" },
        { chunkType: "work_project", embedding: [0.3, 0.4], text: "" },
        { chunkType: "skill_role", embedding: [0.5, 0.6], text: "" },
      ],
      contentHash: "hash",
      embeddingModel: "text-embedding-v4",
      embeddingVersion: "v1",
      organizationId: "org-1",
      profileHash: "profile-hash",
      sourceId: "record-1",
      sourceType: "studio_interview",
      status: "active",
    });
    expect(markIndexed).toHaveBeenCalledWith({
      contentHash: "hash",
      embeddingModel: "text-embedding-v4",
      embeddingVersion: "v1",
      organizationId: "org-1",
      profileHash: "profile-hash",
      sourceId: "record-1",
      sourceType: "studio_interview",
    });
  });

  it("rejects incomplete pool vector sets", async () => {
    const upsertResumeEmbeddings = vi.fn();

    await expect(
      cloneResumeSemanticIndexFromPoolToInterview(
        {
          organizationId: "org-1",
          poolItemId: "pool-1",
          resumeRecordId: "record-1",
        },
        {
          getEmbeddingVersion: () => "v1",
          loadSourceIndexState: vi.fn().mockResolvedValue({
            contentHash: "hash",
            embeddingModel: "text-embedding-v4",
            embeddingVersion: "v1",
            profileHash: "profile-hash",
            status: "indexed",
          }),
          markIndexed: vi.fn(),
          vectorStore: {
            loadResumeEmbeddings: vi.fn().mockResolvedValue(chunks.slice(0, 2)),
            upsertResumeEmbeddings,
          },
        },
      ),
    ).rejects.toThrow("semantic vectors are incomplete");

    expect(upsertResumeEmbeddings).not.toHaveBeenCalled();
  });
});
