import { describe, expect, it } from "vitest";
import {
  jobDescriptionSaveSchema,
  resolveJobRecruitingStatusTransition,
} from "../job-descriptions";

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

  it.each([undefined, null, "", "  ", "要求 **行业经验**"])(
    "accepts optional internal criteria: %s",
    (internalCriteria) => {
      const parsed = jobDescriptionSaveSchema.parse({ ...validJob, internalCriteria });
      expect(parsed.internalCriteria).toBe(internalCriteria?.trim() ?? internalCriteria);
    },
  );

  it("rejects oversized internal criteria", () => {
    expect(
      jobDescriptionSaveSchema.safeParse({ ...validJob, internalCriteria: "字".repeat(10_001) })
        .success,
    ).toBe(false);
  });

  it("requires the canonical 岗位 JD prompt", () => {
    expect(jobDescriptionSaveSchema.safeParse({ ...validJob, prompt: "  " }).success).toBe(false);
  });

  it("accepts decimal job weight and rejects an invalid salary range", () => {
    expect(
      jobDescriptionSaveSchema.parse({
        ...validJob,
        headcount: 2,
        jobWeight: "1.12",
        priority: "high",
        salaryMaxK: "35.50",
        salaryMinK: "20",
      }),
    ).toMatchObject({ jobWeight: "1.12", priority: "high" });
    expect(
      jobDescriptionSaveSchema.safeParse({
        ...validJob,
        salaryMaxK: "20",
        salaryMinK: "35",
      }).success,
    ).toBe(false);
  });

  it("accepts a zero salary boundary", () => {
    expect(
      jobDescriptionSaveSchema.parse({
        ...validJob,
        salaryMaxK: "0",
        salaryMinK: "0",
      }),
    ).toMatchObject({ salaryMaxK: "0", salaryMinK: "0" });
  });

  it("rejects a non-positive or over-precise job weight", () => {
    expect(jobDescriptionSaveSchema.safeParse({ ...validJob, jobWeight: "0" }).success).toBe(false);
    expect(jobDescriptionSaveSchema.safeParse({ ...validJob, jobWeight: "1.123" }).success).toBe(
      false,
    );
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

describe("job recruiting status transitions", () => {
  it("allows pausing and resuming without changing existing candidate flows", () => {
    expect(
      resolveJobRecruitingStatusTransition({
        activeCandidateCount: 3,
        currentStatus: "active",
        targetStatus: "paused",
      }),
    ).toBe("update");
    expect(
      resolveJobRecruitingStatusTransition({
        activeCandidateCount: 3,
        currentStatus: "paused",
        targetStatus: "active",
      }),
    ).toBe("update");
  });

  it("requires all candidates to reach a terminal outcome before stopping", () => {
    expect(
      resolveJobRecruitingStatusTransition({
        activeCandidateCount: 1,
        currentStatus: "paused",
        targetStatus: "stopped",
      }),
    ).toBe("blocked_active_candidates");
    expect(
      resolveJobRecruitingStatusTransition({
        activeCandidateCount: 0,
        currentStatus: "paused",
        targetStatus: "stopped",
      }),
    ).toBe("update");
  });

  it("keeps stopped jobs terminal", () => {
    expect(
      resolveJobRecruitingStatusTransition({
        activeCandidateCount: 0,
        currentStatus: "stopped",
        targetStatus: "active",
      }),
    ).toBe("blocked_stopped");
  });
});
