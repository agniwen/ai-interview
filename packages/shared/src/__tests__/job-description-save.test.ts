import { describe, expect, it } from "vitest";
import { jobDescriptionSaveSchema } from "../job-descriptions";

const validJob = {
  allowCrossDepartmentInterviewers: false,
  code: "ABC1234",
  departmentId: "department-1",
  interviewerIds: ["interviewer-1"],
  name: "高级产品经理",
  prompt: "负责企业级招聘产品，要求有 B 端产品经验。",
};

describe("jobDescriptionSaveSchema", () => {
  it("accepts the simplified job form", () => {
    expect(jobDescriptionSaveSchema.parse(validJob)).toEqual(validJob);
  });

  it("requires the canonical 岗位 JD prompt", () => {
    expect(jobDescriptionSaveSchema.safeParse({ ...validJob, prompt: "  " }).success).toBe(false);
  });

  it("rejects retired recruiter evaluation settings", () => {
    expect(
      jobDescriptionSaveSchema.safeParse({
        ...validJob,
        structuredConfig: { dimensionWeights: {} },
      }).success,
    ).toBe(false);
    expect(jobDescriptionSaveSchema.safeParse({ ...validJob, description: "旧描述" }).success).toBe(
      false,
    );
  });
});
