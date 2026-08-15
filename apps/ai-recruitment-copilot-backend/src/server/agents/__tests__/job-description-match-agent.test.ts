import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";

const mocks = vi.hoisted(() => ({
  generateStructuredWithMastraAgent: vi.fn(),
  jobDescriptionMatchAgent: { id: "job-description-match-agent" },
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: mocks.generateStructuredWithMastraAgent,
    jobDescriptionMatchAgent: mocks.jobDescriptionMatchAgent,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { matchJobDescriptionForResume } from "../job-description-match-agent";

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
    mocks.generateStructuredWithMastraAgent.mockResolvedValue({
      jobDescriptionId: "jd-frontend",
      reason: "候选人的 React/TypeScript 经验与岗位匹配",
    });
  });

  it("uses Mastra structured output for the selected JD", async () => {
    const result = await matchJobDescriptionForResume(RESUME_PROFILE, JOBS);

    expect(result).toEqual({
      jobDescriptionId: "jd-frontend",
      reason: "候选人的 React/TypeScript 经验与岗位匹配",
    });
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.jobDescriptionMatchAgent,
        retryOnInvalid: true,
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
  });

  it("adds the uploaded filename as a prioritized job clue when supplied", async () => {
    await matchJobDescriptionForResume(RESUME_PROFILE, JOBS, {
      resumeFileName: "张三-数据工程师-5年经验.pdf",
    });

    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("简历文件名: 张三-数据工程师-5年经验.pdf"),
      }),
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt).toContain(
      "文件名可能包含候选人投递的岗位信息；将其作为强岗位线索优先参考",
    );
  });

  it("uses a strict schema constrained to the supplied candidate IDs", async () => {
    await matchJobDescriptionForResume(RESUME_PROFILE, JOBS);

    const schema = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.schema as z.ZodType;
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
    expect(mocks.generateStructuredWithMastraAgent).not.toHaveBeenCalled();
  });

  it("selects the only candidate without a model call", async () => {
    await expect(matchJobDescriptionForResume(RESUME_PROFILE, [JOBS[0]])).resolves.toEqual({
      jobDescriptionId: "jd-frontend",
      reason: "候选岗位只有一个，默认选择。",
    });
    expect(mocks.generateStructuredWithMastraAgent).not.toHaveBeenCalled();
  });
});
