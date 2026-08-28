import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";

import {
  matchJobDescriptionForResume,
  rankJobDescriptionsForResume,
} from "../job-description-match-agent";

const generateMatch = vi.fn();
const dependencies = { generateMatch };

const RESUME_PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: ["业务前端"],
  phone: null,
  projectExperiences: [
    {
      name: "商家后台",
      period: "2022-2024",
      role: "前端负责人",
      summary: "负责 React 业务平台",
      techStack: ["React", "TypeScript"],
    },
  ],
  schools: [],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

// SAFETY: This test constructs the value with the asserted contract before this boundary.
const JOBS = [
  {
    departmentName: "技术部",
    description: "负责 React 业务平台前端开发",
    id: "jd-frontend",
    name: "前端工程师",
  },
  {
    departmentName: "数据部",
    description: "负责数据仓库建设",
    id: "jd-data",
    name: "数据工程师",
  },
] as JobDescriptionListRecord[];

describe("matchJobDescriptionForResume", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    generateMatch.mockResolvedValue({
      jobDescriptionId: "jd-frontend",
      reason: "候选人的 React/TypeScript 经验与岗位匹配",
    });
  });

  it("uses Mastra structured output for the selected JD", async () => {
    const result = await matchJobDescriptionForResume(RESUME_PROFILE, JOBS, {}, dependencies);

    expect(result).toEqual({
      jobDescriptionId: "jd-frontend",
      reason: "候选人的 React/TypeScript 经验与岗位匹配",
    });
    expect(generateMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.any(Object),
      }),
    );
  });

  it("adds the uploaded filename as a prioritized job clue when supplied", async () => {
    await matchJobDescriptionForResume(
      RESUME_PROFILE,
      JOBS,
      { resumeFileName: "张三-数据工程师-5年经验.pdf" },
      dependencies,
    );

    expect(generateMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("简历文件名: 张三-数据工程师-5年经验.pdf"),
      }),
    );
    expect(generateMatch.mock.calls[0]?.[0]?.prompt).toContain(
      "文件名可能包含候选人投递的岗位信息；将其作为强岗位线索优先参考",
    );
  });

  it("uses a strict schema constrained to the supplied candidate IDs", async () => {
    await matchJobDescriptionForResume(RESUME_PROFILE, JOBS, {}, dependencies);

    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const schema = generateMatch.mock.calls[0]?.[0]?.schema;
    expect(
      schema.safeParse({
        jobDescriptionId: "jd-frontend",
        reason: "前端经验匹配",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        jobDescriptionId: "jd-outside-candidates",
        reason: "越界选择",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        extra: "unexpected",
        jobDescriptionId: "jd-frontend",
        reason: "前端经验匹配",
      }).success,
    ).toBe(false);
  });

  it("returns null without a model call when there are no candidates", async () => {
    await expect(matchJobDescriptionForResume(RESUME_PROFILE, [])).resolves.toBeNull();
    expect(generateMatch).not.toHaveBeenCalled();
  });

  it("selects the only candidate without a model call", async () => {
    await expect(matchJobDescriptionForResume(RESUME_PROFILE, [JOBS[0]])).resolves.toEqual({
      jobDescriptionId: "jd-frontend",
      reason: "候选岗位只有一个，默认选择。",
    });
    expect(generateMatch).not.toHaveBeenCalled();
  });
});

describe("rankJobDescriptionsForResume", () => {
  it("returns a complete ordered candidate list and validates every candidate id", async () => {
    const generateRanking = vi.fn().mockResolvedValue({
      candidates: [
        {
          jobDescriptionId: "jd-frontend",
          matchScore: 88,
          rank: 1,
          reason: "React 与 TypeScript 经历高度匹配",
        },
        {
          jobDescriptionId: "jd-data",
          matchScore: 35,
          rank: 2,
          reason: "具备工程能力，但缺少数据仓库经验",
        },
      ],
      selectedJobDescriptionId: "jd-frontend",
    });

    const result = await rankJobDescriptionsForResume(
      RESUME_PROFILE,
      JOBS,
      {
        resumeFileName: "张三-前端工程师.pdf",
        vectorScores: new Map([
          [
            "jd-frontend",
            { score: 82, similarity: { resumeOverview: 0.7, skillRole: 0.9, workProject: 0.8 } },
          ],
        ]),
      },
      { generateRanking },
    );

    expect(result).toEqual({
      candidates: expect.arrayContaining([
        expect.objectContaining({ jobDescriptionId: "jd-frontend", rank: 1 }),
        expect.objectContaining({ jobDescriptionId: "jd-data", rank: 2 }),
      ]),
      selectedJobDescriptionId: "jd-frontend",
    });
    expect(generateRanking.mock.calls[0]?.[0]?.prompt).toContain("targetRoles 是次强岗位意向信号");
    expect(generateRanking.mock.calls[0]?.[0]?.prompt).toContain(
      "与 targetRoles 冲突时，优先参考 targetRoles",
    );
    const schema = generateRanking.mock.calls[0]?.[0]?.schema;
    expect(
      schema.safeParse({
        candidates: [
          { jobDescriptionId: "jd-frontend", matchScore: 80, rank: 1, reason: "匹配" },
          { jobDescriptionId: "jd-frontend", matchScore: 70, rank: 2, reason: "重复" },
        ],
        selectedJobDescriptionId: "jd-frontend",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        candidates: [
          { jobDescriptionId: "jd-frontend", matchScore: 80, rank: 1, reason: "遗漏候选" },
        ],
        selectedJobDescriptionId: "jd-frontend",
      }).success,
    ).toBe(false);
  });

  it("selects the sole candidate without a model call", async () => {
    const generateRanking = vi.fn();
    await expect(
      rankJobDescriptionsForResume(RESUME_PROFILE, [JOBS[0]], {}, { generateRanking }),
    ).resolves.toEqual({
      candidates: [
        {
          jobDescriptionId: "jd-frontend",
          matchScore: 100,
          rank: 1,
          reason: "候选岗位只有一个，默认选择。",
        },
      ],
      selectedJobDescriptionId: "jd-frontend",
    });
    expect(generateRanking).not.toHaveBeenCalled();
  });

  it("includes bounded JD requirements so same-name jobs remain distinguishable", async () => {
    const generateRanking = vi.fn().mockResolvedValue({
      candidates: [
        {
          jobDescriptionId: "jd-frontend",
          matchScore: 90,
          rank: 1,
          reason: "要求匹配",
        },
        { jobDescriptionId: "jd-data", matchScore: 30, rank: 2, reason: "要求不匹配" },
      ],
      selectedJobDescriptionId: "jd-frontend",
    });
    const longPrompt = `核心要求：商业化平台经验${"甲".repeat(2000)}不应进入模型的尾部标记`;
    const longDescription = `岗位描述：业务平台建设${"乙".repeat(2000)}描述尾部不应进入模型`;
    const sameNameJobs = [
      { ...JOBS[0], description: longDescription, name: "技术经理", prompt: longPrompt },
      { ...JOBS[1], name: "技术经理", prompt: "核心要求：数据仓库和实时计算经验" },
    ];

    await rankJobDescriptionsForResume(RESUME_PROFILE, sameNameJobs, {}, { generateRanking });

    const prompt = generateRanking.mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain("岗位 JD: 核心要求：商业化平台经验");
    expect(prompt).toContain("岗位 JD: 核心要求：数据仓库和实时计算经验");
    expect(prompt).toContain("[内容已截断]");
    expect(prompt).not.toContain("不应进入模型的尾部标记");
    expect(prompt).not.toContain("描述尾部不应进入模型");
  });

  it("preserves subject-code recall as the strongest signal in the AI ranking prompt", async () => {
    const generateRanking = vi.fn().mockResolvedValue({
      candidates: [
        { jobDescriptionId: "jd-data", matchScore: 90, rank: 1, reason: "主题编码命中" },
        { jobDescriptionId: "jd-frontend", matchScore: 70, rank: 2, reason: "目标岗位匹配" },
      ],
      selectedJobDescriptionId: "jd-data",
    });

    await rankJobDescriptionsForResume(
      RESUME_PROFILE,
      JOBS,
      {
        recallSources: new Map([
          ["jd-data", "subject_code"],
          ["jd-frontend", "target_role_exact"],
        ]),
      },
      { generateRanking },
    );

    const prompt = generateRanking.mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain("邮件主题岗位编码是最强的明确投递信号");
    expect(prompt).toContain("召回线索: 邮件主题岗位编码");
    expect(prompt).toContain("召回线索: 简历目标岗位精准匹配");
  });

  it("ranks large published-job sets in bounded AI calls while preserving every candidate", async () => {
    const manyJobs = Array.from({ length: 21 }, (_, index) => ({
      ...JOBS[0],
      description: `岗位 ${index + 1} 描述`,
      id: `jd-${index + 1}`,
      name: `岗位 ${index + 1}`,
    }));
    const generateRanking = vi.fn(({ prompt }: { prompt: string }) => {
      const ids = [...prompt.matchAll(/^- id: (.+)$/gmu)].map((match) => match[1]);
      const ordered = ids.length === 2 && ids.includes("jd-21") ? ids.toReversed() : ids;
      return Promise.resolve({
        candidates: ordered.map((id, index) => ({
          jobDescriptionId: id,
          matchScore: 90 - index,
          rank: index + 1,
          reason: `批次排序 ${index + 1}`,
        })),
        selectedJobDescriptionId: ordered[0],
      });
    });

    const result = await rankJobDescriptionsForResume(
      RESUME_PROFILE,
      manyJobs,
      {},
      { generateRanking },
    );

    expect(generateRanking).toHaveBeenCalledTimes(2);
    for (const [input] of generateRanking.mock.calls) {
      expect([...input.prompt.matchAll(/^- id: (.+)$/gmu)].length).toBeLessThanOrEqual(20);
    }
    expect(result?.selectedJobDescriptionId).toBe("jd-21");
    expect(result?.candidates).toHaveLength(21);
    expect(result?.candidates.map((candidate) => candidate.rank)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );
  });
});
