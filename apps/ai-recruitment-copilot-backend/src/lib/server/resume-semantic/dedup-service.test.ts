import { describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { findSemanticResumeDuplicates } from "./dedup-service";

const queryProfile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "new@example.com",
  gender: null,
  name: "张三",
  personalStrengths: [],
  phone: "13800000000",
  projectExperiences: [
    {
      name: "招聘系统",
      period: "2023-2024",
      role: "负责人",
      summary: "负责候选人推荐。",
      techStack: ["TypeScript", "PostgreSQL"],
    },
  ],
  schools: ["浙江大学"],
  skills: ["TypeScript", "PostgreSQL"],
  targetRoles: ["全栈工程师"],
  workExperiences: [
    {
      company: "阿里巴巴",
      period: "2021-2024",
      role: "高级工程师",
      summary: "负责招聘系统。",
    },
  ],
  workYears: 3,
};

describe("findSemanticResumeDuplicates", () => {
  it("returns no matches when semantic dedup is disabled", async () => {
    const matches = await findSemanticResumeDuplicates(
      {
        email: queryProfile.email,
        name: queryProfile.name,
        organizationId: "org-1",
        phone: queryProfile.phone,
        resumeProfile: queryProfile,
      },
      {
        embed: vi.fn(),
        embeddingConfig: {
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          model: "text-embedding-v4",
        },
        enabled: false,
        loadCandidates: vi.fn(),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes: vi.fn(),
          upsertResumeEmbeddings: vi.fn(),
        },
      },
    );

    expect(matches).toEqual([]);
  });

  it("adds semantic matches and reasons when vector search finds similar resumes", async () => {
    const ensureCollection = vi.fn();
    const matches = await findSemanticResumeDuplicates(
      {
        email: queryProfile.email,
        name: queryProfile.name,
        organizationId: "org-1",
        phone: queryProfile.phone,
        resumeProfile: queryProfile,
      },
      {
        embed: vi.fn(({ chunks }) =>
          Promise.resolve(
            chunks.map((chunk: { chunkType: string; text: string }, index: number) => ({
              ...chunk,
              embedding: [index, index + 1],
            })),
          ),
        ),
        embeddingConfig: {
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          model: "text-embedding-v4",
        },
        enabled: true,
        loadCandidates: () =>
          Promise.resolve([
            {
              candidateEmail: "other@example.com",
              candidateName: "李四",
              candidatePhone: "13900000000",
              createdAt: "2026-01-02T00:00:00.000Z",
              id: "candidate-semantic",
              jobDescriptionName: null,
              resumeProfile: queryProfile,
              status: "ready",
              targetRole: "全栈工程师",
            },
          ]),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection,
          searchSimilarResumes: vi.fn(({ chunkType }) =>
            Promise.resolve([
              {
                chunkType,
                score: chunkType === "work_project" ? 0.96 : 0.9,
                sourceId: "candidate-semantic",
                sourceType: "studio_interview" as const,
              },
            ]),
          ),
          upsertResumeEmbeddings: vi.fn(),
        },
      },
    );

    expect(matches[0]).toMatchObject({
      id: "candidate-semantic",
      level: "high",
    });
    expect(ensureCollection).toHaveBeenCalledTimes(1);
    expect(matches[0]?.score).toBeGreaterThanOrEqual(92);
    expect(matches[0]?.semanticReasons).toContain("工作/项目经历语义高度相似");
  });

  it("returns no matches when vector search fails", async () => {
    const matches = await findSemanticResumeDuplicates(
      {
        email: queryProfile.email,
        name: queryProfile.name,
        organizationId: "org-1",
        phone: queryProfile.phone,
        resumeProfile: queryProfile,
      },
      {
        embed: vi.fn(() => Promise.reject(new Error("embedding failed"))),
        embeddingConfig: {
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          model: "text-embedding-v4",
        },
        enabled: true,
        loadCandidates: vi.fn(),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes: vi.fn(),
          upsertResumeEmbeddings: vi.fn(),
        },
      },
    );

    expect(matches).toEqual([]);
  });
});
