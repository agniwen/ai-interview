import { beforeEach, describe, expect, it, vi } from "vitest";
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
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
  });
});
