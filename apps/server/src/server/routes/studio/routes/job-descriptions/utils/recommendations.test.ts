import { describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { studioInterview } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import type {
  ResumeSemanticChunkType,
  ResumeSemanticTextChunk,
} from "../../../../../../lib/server/resume-semantic/text-builders";
import {
  recommendationCandidateWhere,
  recommendCandidatesForJobDescription,
  scoreCandidatesForJobDescription,
} from "./recommendations";

const candidateProfile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "lin@example.com",
  gender: null,
  name: "林一",
  personalStrengths: [],
  phone: "13800000000",
  projectExperiences: [
    {
      name: "招聘推荐系统",
      period: "2025",
      role: "负责人",
      summary: "基于向量检索推荐候选人。",
      techStack: ["TypeScript", "PostgreSQL", "Qdrant"],
    },
  ],
  schools: ["浙江大学"],
  skills: ["TypeScript", "PostgreSQL", "Qdrant"],
  targetRoles: ["全栈工程师"],
  workExperiences: [
    {
      company: "Arc",
      period: "2023-2026",
      role: "高级全栈工程师",
      summary: "负责 AI 招聘系统与候选人推荐。",
    },
  ],
  workYears: 4,
};

describe("recommendCandidatesForJobDescription", () => {
  it("returns weighted recommendations with reasons from JD semantic search", async () => {
    const embed = vi.fn(({ chunks }) =>
      Promise.resolve(
        chunks.map((chunk: { chunkType: string; text: string }, index: number) => ({
          ...chunk,
          embedding: [index, index + 1],
        })),
      ),
    );
    const searchSimilarResumes = vi.fn(({ chunkType }) => {
      let score = 0.7;
      if (chunkType === "skill_role") {
        score = 0.9;
      } else if (chunkType === "work_project") {
        score = 0.8;
      }
      return Promise.resolve([
        {
          chunkType,
          score,
          sourceId: "candidate-1",
          sourceType: "studio_interview" as const,
        },
        {
          chunkType,
          score: 0.99,
          sourceId: "already-linked",
          sourceType: "studio_interview" as const,
        },
      ]);
    });

    const result = await recommendCandidatesForJobDescription(
      {
        excludeAlreadyLinked: true,
        jobDescription: {
          departmentName: "研发部",
          id: "jd-1",
          name: "全栈工程师",
          prompt: "熟悉 TypeScript、PostgreSQL、Qdrant，有招聘系统经验。",
        },
        limit: 10,
        organizationId: "org-1",
      },
      {
        embed,
        embeddingConfig: {
          apiKey: "key",
          baseUrl: "https://dashscope.example/v1",
          dimensions: 2,
          model: "text-embedding-v4",
        },
        enabled: true,
        loadCandidates: vi.fn(() =>
          Promise.resolve([
            {
              candidateEmail: "lin@example.com",
              candidateName: "林一",
              candidatePhone: "13800000000",
              createdAt: "2026-01-02T00:00:00.000Z",
              currentJobDescriptionId: null,
              currentJobDescriptionName: null,
              id: "candidate-1",
              notes: "候选人有 AI 招聘产品经验。",
              resumeFileName: "lin-resume.pdf",
              resumeParseStatus: "ready" as const,
              resumeProfile: candidateProfile,
              skillsNormalized: ["typescript", "postgresql", "qdrant"],
              targetRole: "全栈工程师",
            },
            {
              candidateEmail: "old@example.com",
              candidateName: "已关联候选人",
              candidatePhone: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              currentJobDescriptionId: "jd-1",
              currentJobDescriptionName: "全栈工程师",
              id: "already-linked",
              notes: null,
              resumeFileName: "old-resume.pdf",
              resumeParseStatus: "ready" as const,
              resumeProfile: candidateProfile,
              skillsNormalized: ["typescript"],
              targetRole: "全栈工程师",
            },
          ]),
        ),
        vectorStore: {
          deleteResumeEmbeddings: vi.fn(),
          ensureCollection: vi.fn(),
          searchSimilarResumes,
          upsertResumeEmbeddings: vi.fn(),
        },
      },
    );

    expect(embed).toHaveBeenCalledWith(
      expect.objectContaining({
        chunks: expect.arrayContaining([
          expect.objectContaining({ chunkType: "skill_role" }),
          expect.objectContaining({ chunkType: "work_project" }),
          expect.objectContaining({ chunkType: "resume_overview" }),
        ]),
      }),
    );
    expect(searchSimilarResumes).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        sourceTypes: ["studio_interview"],
      }),
    );
    expect(result.status).toBe("ready");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      candidateEmail: "lin@example.com",
      candidateName: "林一",
      id: "candidate-1",
      masteredSkills: ["TypeScript", "PostgreSQL", "Qdrant"],
      profileHighlights: {
        latestCompany: "Arc",
        latestProject: "招聘推荐系统",
        schools: ["浙江大学"],
      },
      score: 82,
      similarity: {
        resumeOverview: 0.7,
        skillRole: 0.9,
        workProject: 0.8,
      },
      targetRole: "全栈工程师",
      workYears: 4,
    });
    expect(result.candidates[0]?.reasons).toEqual(
      expect.arrayContaining([
        "技能与岗位要求相似",
        "项目/职责经验匹配",
        "命中技能：TypeScript、PostgreSQL、Qdrant",
      ]),
    );
    expect(result.diagnostics.vectorHitCount).toBe(2);
  });
});

const rec = (id: string, currentJd: string | null = null) => ({
  candidateEmail: null,
  candidateName: id,
  candidatePhone: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  currentJobDescriptionId: currentJd,
  currentJobDescriptionName: null,
  id,
  notes: null,
  resumeFileName: null,
  resumeParseStatus: "ready" as const,
  resumeProfile: candidateProfile,
  skillsNormalized: [],
  targetRole: null,
});
const depsWith = (
  search: (a: { chunkType: string }) => number,
  candidates: ReturnType<typeof rec>[],
) => ({
  embed: vi.fn(({ chunks }: { chunks: ResumeSemanticTextChunk[] }) =>
    Promise.resolve(chunks.map((c) => ({ ...c, embedding: [1, 2] }))),
  ),
  embeddingConfig: { apiKey: "k", baseUrl: "b", dimensions: 2, model: "m" },
  enabled: true,
  loadCandidates: vi.fn(() => Promise.resolve(candidates)),
  vectorStore: {
    deleteResumeEmbeddings: vi.fn(() => Promise.resolve()),
    ensureCollection: vi.fn(() => Promise.resolve()),
    searchSimilarResumes: vi.fn(({ chunkType }: { chunkType: ResumeSemanticChunkType }) =>
      Promise.resolve(
        candidates.map((c) => ({
          chunkType,
          score: search({ chunkType }),
          sourceId: c.id,
          sourceType: "studio_interview" as const,
        })),
      ),
    ),
    upsertResumeEmbeddings: vi.fn(() => Promise.resolve()),
  },
});
const jd = { departmentName: null, id: "jd1", name: "后端", prompt: "p" };
const call = (deps: ReturnType<typeof depsWith>, excludeAlreadyLinked = true, limit = 20) =>
  recommendCandidatesForJobDescription(
    { excludeAlreadyLinked, jobDescription: jd, limit, organizationId: "org" },
    deps,
  );

describe("recommendCandidatesForJobDescription — 特征化(锁生产行为)", () => {
  it("score<55 被阈值剔除", async () => {
    const res = await call(depsWith(() => 0.2, [rec("low")]));
    expect(res.candidates).toHaveLength(0);
  });
  it("limit 截断：两高分 limit=1 只返回第一", async () => {
    const res = await call(
      depsWith(({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9), [rec("a"), rec("b")]),
      true,
      1,
    );
    expect(res.candidates).toHaveLength(1);
  });
  it("同分保留输入(loadCandidates)顺序", async () => {
    const res = await call(
      depsWith(({ chunkType }) => (chunkType === "skill_role" ? 0.9 : 0.9), [rec("a"), rec("b")]),
    );
    expect(res.candidates.map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("excludeAlreadyLinked=true 剔除已绑定本 JD", async () => {
    const res = await call(
      depsWith(
        ({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9),
        [rec("linked", "jd1")],
      ),
    );
    expect(res.candidates.map((c) => c.id)).not.toContain("linked");
  });
  it("excludeAlreadyLinked=false 保留已绑定本 JD", async () => {
    const res = await call(
      depsWith(
        ({ chunkType }) => (chunkType === "skill_role" ? 0.95 : 0.9),
        [rec("linked", "jd1")],
      ),
      false,
    );
    expect(res.candidates.map((c) => c.id)).toContain("linked");
  });
});

describe("recommendCandidatesForJobDescription — disabled", () => {
  it("returns disabled status when semantic recommendation is not enabled", async () => {
    const result = await recommendCandidatesForJobDescription(
      {
        excludeAlreadyLinked: true,
        jobDescription: {
          departmentName: null,
          id: "jd-1",
          name: "产品经理",
          prompt: "",
        },
        limit: 10,
        organizationId: "org-1",
      },
      {
        embed: vi.fn(),
        embeddingConfig: {
          apiKey: "",
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

    expect(result).toMatchObject({
      candidates: [],
      status: "disabled",
    });
  });
});

describe("scoreCandidatesForJobDescription — 打分内核", () => {
  it("内核返回完整排序 + 诊断中间量(不套阈值/截断，不调 ensureCollection)", async () => {
    const ensureCollection = vi.fn(() => Promise.resolve());
    const deps = {
      ...depsWith(() => 0.2, [rec("low")]),
      vectorStore: {
        deleteResumeEmbeddings: vi.fn(() => Promise.resolve()),
        ensureCollection,
        searchSimilarResumes: vi.fn(({ chunkType }: { chunkType: ResumeSemanticChunkType }) =>
          Promise.resolve([
            { chunkType, score: 0.2, sourceId: "low", sourceType: "studio_interview" as const },
          ]),
        ),
        upsertResumeEmbeddings: vi.fn(() => Promise.resolve()),
      },
    };
    const core = await scoreCandidatesForJobDescription(
      { jobDescription: jd, organizationId: "org" },
      deps,
    );
    // 低分未被 55 剔除
    expect(core.ranked).toHaveLength(1);
    expect(core.ranked[0].candidateId).toBe("low");
    expect(core.retrievedIds.has("low")).toBe(true);
    expect(core.loadedIds.has("low")).toBe(true);
    // 内核不调 ensureCollection
    expect(ensureCollection).not.toHaveBeenCalled();
  });
});

// 只 select id，让 SQL 里 pipeline_stage 只可能来自 WHERE 过滤(而非 select 列表)。
const whereSqlFor = (includeClosed: boolean) =>
  db
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(recommendationCandidateWhere("org", ["a"], includeClosed))
    .toSQL()
    .sql.toLowerCase();

describe("recommendationCandidateWhere — includeClosed 两分支", () => {
  it("includeClosed=false 含 pipeline_stage 过滤(生产默认)", () => {
    expect(whereSqlFor(false)).toContain("pipeline_stage");
  });
  it("includeClosed=true 不含 pipeline_stage 过滤(评测)", () => {
    expect(whereSqlFor(true)).not.toContain("pipeline_stage");
  });
});
