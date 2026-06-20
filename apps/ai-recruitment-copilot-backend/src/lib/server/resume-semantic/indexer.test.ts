import { describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { runResumeSemanticIndexJob } from "./indexer";

const profile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "张三",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: ["浙江大学"],
  skills: ["TypeScript"],
  targetRoles: ["全栈工程师"],
  workExperiences: [
    {
      company: "阿里巴巴",
      period: "2021-2024",
      role: "工程师",
      summary: "负责招聘系统。",
    },
  ],
  workYears: 3,
};

describe("runResumeSemanticIndexJob", () => {
  it("skips rows without a ready profile", async () => {
    const markSkipped = vi.fn();

    await runResumeSemanticIndexJob(
      {
        organizationId: "org-1",
        sourceId: "candidate-1",
        sourceType: "studio_interview",
      },
      {
        embed: vi.fn(),
        getConfig: () => ({
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          embeddingVersion: "v1",
          model: "text-embedding-v4",
          qdrantApiKey: "qdrant-key",
          qdrantCollectionName: "resume_semantic_v1",
          qdrantUrl: "https://qdrant.example",
        }),
        loadSource: () => Promise.resolve(null),
        markFailed: vi.fn(),
        markIndexed: vi.fn(),
        markSkipped,
        readIndexState: vi.fn(),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes: vi.fn(),
          upsertResumeEmbeddings: vi.fn(),
        },
      },
    );

    expect(markSkipped).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "resume profile is not ready",
        sourceId: "candidate-1",
      }),
    );
  });

  it("does not reindex an unchanged profile hash", async () => {
    const upsertResumeEmbeddings = vi.fn();

    await runResumeSemanticIndexJob(
      {
        organizationId: "org-1",
        sourceId: "candidate-1",
        sourceType: "studio_interview",
      },
      {
        embed: vi.fn(),
        getConfig: () => ({
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          embeddingVersion: "v1",
          model: "text-embedding-v4",
          qdrantApiKey: "qdrant-key",
          qdrantCollectionName: "resume_semantic_v1",
          qdrantUrl: "https://qdrant.example",
        }),
        loadSource: () =>
          Promise.resolve({
            contentHash: "hash",
            profile,
            status: "active",
          }),
        markFailed: vi.fn(),
        markIndexed: vi.fn(),
        markSkipped: vi.fn(),
        readIndexState: ({ profileHash }) =>
          Promise.resolve({
            profileHash,
            status: "indexed",
          }),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes: vi.fn(),
          upsertResumeEmbeddings,
        },
      },
    );

    expect(upsertResumeEmbeddings).not.toHaveBeenCalled();
  });

  it("embeds three chunks and upserts them into the vector store", async () => {
    const embed = vi.fn(({ chunks }) =>
      Promise.resolve(
        chunks.map((chunk: { chunkType: string; text: string }, index: number) => ({
          ...chunk,
          embedding: [index, index + 1],
        })),
      ),
    );
    const upsertResumeEmbeddings = vi.fn();

    await runResumeSemanticIndexJob(
      {
        organizationId: "org-1",
        sourceId: "candidate-1",
        sourceType: "studio_interview",
      },
      {
        embed,
        getConfig: () => ({
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          embeddingVersion: "v1",
          model: "text-embedding-v4",
          qdrantApiKey: "qdrant-key",
          qdrantCollectionName: "resume_semantic_v1",
          qdrantUrl: "https://qdrant.example",
        }),
        loadSource: () =>
          Promise.resolve({
            contentHash: "hash",
            profile,
            status: "active",
          }),
        markFailed: vi.fn(),
        markIndexed: vi.fn(),
        markSkipped: vi.fn(),
        readIndexState: () => Promise.resolve(null),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes: vi.fn(),
          upsertResumeEmbeddings,
        },
      },
    );

    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({ chunkType: "resume_overview" }),
          expect.objectContaining({ chunkType: "work_project" }),
          expect.objectContaining({ chunkType: "skill_role" }),
        ]),
      }),
    );
    expect(upsertResumeEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: expect.arrayContaining([expect.objectContaining({ chunkType: "work_project" })]),
        embeddingModel: "text-embedding-v4",
        embeddingVersion: "v1",
        organizationId: "org-1",
        sourceId: "candidate-1",
      }),
    );
  });
});
