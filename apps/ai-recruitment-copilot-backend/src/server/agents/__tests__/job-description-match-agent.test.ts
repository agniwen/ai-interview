import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";

const mocks = vi.hoisted(() => ({
  createAlibabaProvider: vi.fn(),
  createResumeAgent: vi.fn(),
  generateText: vi.fn(),
  outputObject: vi.fn(),
}));

vi.mock("ai", () => ({
  Output: {
    object: mocks.outputObject,
  },
  generateText: mocks.generateText,
}));

vi.mock("../provider", () => ({
  createAlibabaProvider: mocks.createAlibabaProvider,
}));

vi.mock("../resume-agent", () => ({
  createResumeAgent: mocks.createResumeAgent,
}));

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
    process.env.ALIBABA_API_KEY = "test-key";
    process.env.ALIBABA_BASE_URL = "https://example.test";
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";
    mocks.createAlibabaProvider.mockReturnValue((modelId: string) => ({ modelId }));
    mocks.outputObject.mockReturnValue("match-output");
    mocks.generateText.mockResolvedValue({
      output: {
        jobDescriptionId: "jd-frontend",
        reason: "候选人的 React/TypeScript 经验与岗位匹配",
      },
      text: JSON.stringify({
        jobDescriptionId: "jd-frontend",
        reason: "候选人的 React/TypeScript 经验与岗位匹配",
      }),
    });
    mocks.createResumeAgent.mockReturnValue({
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          jobDescriptionId: "jd-frontend",
          reason: "候选人的 React/TypeScript 经验与岗位匹配",
        }),
      }),
    });
  });

  it("uses AI SDK structured output for the selected JD", async () => {
    const result = await matchJobDescriptionForResume(RESUME_PROFILE, JOBS);

    expect(result).toEqual({
      jobDescriptionId: "jd-frontend",
      reason: "候选人的 React/TypeScript 经验与岗位匹配",
    });
    expect(mocks.outputObject).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.any(String),
        name: "job_description_match",
      }),
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        output: "match-output",
      }),
    );
    expect(mocks.createResumeAgent).not.toHaveBeenCalled();
  });
});
