import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeReviewGenerationDependencies } from "./review-generation";
import { generateResumeReviewBestEffort } from "./review-generation";

const mocks = {
  generateResumeReview: vi.fn(),
  generateResumeScreeningResult: vi.fn(),
  loadRecruitingJobDescriptionById: vi.fn(),
  runStructuredReview: vi.fn(),
};

const dependencies = {
  generateReview: mocks.generateResumeReview,
  generateScreeningResult: mocks.generateResumeScreeningResult,
  loadJobDescription: mocks.loadRecruitingJobDescriptionById,
  runStructuredReview: mocks.runStructuredReview,
} satisfies ResumeReviewGenerationDependencies;

const RESUME_PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: null,
};

describe("generateResumeReviewBestEffort", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
  });

  it("generates a structured V2 review with job description context", async () => {
    const structuredReview = { overall: { baseScore: 86 } };
    mocks.loadRecruitingJobDescriptionById.mockResolvedValue({
      description: "负责 Web 端研发",
      evaluationMode: "legacy",
      name: "前端工程师",
      prompt: "需要 React 经验",
      resumeScreeningPolicy: { enabled: true, rules: [], version: 1 },
    });
    mocks.generateResumeScreeningResult.mockResolvedValue({
      policyEmpty: true,
      policyEnabled: true,
      policyHash: "hash",
      policyVersion: 1,
      recommendation: "pass",
      ruleResults: [],
    });
    mocks.generateResumeReview.mockResolvedValue({
      review: "评价 markdown",
      structuredReview,
    });

    const result = await generateResumeReviewBestEffort(
      {
        evaluationAsOf: "2026-07-29",
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        resumeContentHash: null,
        resumeInputHash: "input-hash",
        resumeProfile: RESUME_PROFILE,
        runId: "run-1",
      },
      dependencies,
    );

    expect(result?.mode).toBe("legacy");
    expect(result?.mode === "legacy" ? result.resumeReview : null).toBe(structuredReview);
    expect(mocks.loadRecruitingJobDescriptionById).toHaveBeenCalledWith("org-1", "jd-1");
    expect(mocks.generateResumeReview).toHaveBeenCalledWith({
      jobDescription:
        "岗位名称：前端工程师\n\n岗位描述：负责 Web 端研发\n\n岗位 Prompt：\n需要 React 经验",
      resumeProfile: RESUME_PROFILE,
      screeningResult: {
        policyEmpty: true,
        policyEnabled: true,
        policyHash: "hash",
        policyVersion: 1,
        recommendation: "pass",
        ruleResults: [],
      },
    });
  });

  it("returns null when review generation fails", async () => {
    mocks.loadRecruitingJobDescriptionById.mockResolvedValue(null);
    mocks.generateResumeScreeningResult.mockResolvedValue({
      policyEmpty: true,
      policyEnabled: false,
      policyHash: null,
      policyVersion: null,
      recommendation: "pass",
      ruleResults: [],
    });
    mocks.generateResumeReview.mockRejectedValue(new Error("model unavailable"));

    const result = await generateResumeReviewBestEffort(
      {
        evaluationAsOf: "2026-07-29",
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        resumeContentHash: null,
        resumeInputHash: "input-hash",
        resumeProfile: RESUME_PROFILE,
        runId: "run-1",
      },
      dependencies,
    );

    expect(result).toBeNull();
  });
});
