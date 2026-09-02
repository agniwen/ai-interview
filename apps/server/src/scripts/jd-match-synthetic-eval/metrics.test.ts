import { describe, expect, it } from "vitest";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import type { SyntheticJdMatchCase, SyntheticJdMatchRunRecord } from "./types";
import { computeJdMatchSyntheticMetrics, getJdMatchStrictFailures } from "./metrics";

const CASE: SyntheticJdMatchCase = {
  // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
  candidates: [
    { id: "jd-frontend", name: "前端工程师" },
    { id: "jd-data", name: "数据工程师" },
  ] as JobDescriptionListRecord[],
  expectedId: "jd-frontend",
  id: "frontend",
  name: "前端直接匹配",
  reasonTerms: ["React", "前端"],
  resumeProfile: {
    age: null,
    educationExperiences: [],
    email: null,
    gender: null,
    name: "合成候选人",
    personalStrengths: [],
    phone: null,
    projectExperiences: [],
    schools: [],
    skills: ["React"],
    targetRoles: ["前端工程师"],
    workExperiences: [],
    workYears: 3,
  },
};

const success = (
  runIndex: number,
  jobDescriptionId: string,
  reason: string,
): SyntheticJdMatchRunRecord => ({
  caseId: CASE.id,
  result: { jobDescriptionId, reason },
  runIndex,
  status: "success",
});

describe("computeJdMatchSyntheticMetrics", () => {
  it("computes validity, expected Top-1, agreement and reason coverage", () => {
    const runs: SyntheticJdMatchRunRecord[] = [
      success(1, "jd-frontend", "React 前端经验匹配"),
      success(2, "jd-frontend", "目标岗位为前端工程师"),
      success(3, "jd-data", "数据岗位更接近"),
      { caseId: CASE.id, error: "model unavailable", runIndex: 4, status: "failed" },
    ];

    const metrics = computeJdMatchSyntheticMetrics([CASE], runs);

    expect(metrics).toMatchObject({
      candidateIdValidityRate: 1,
      expectedTop1Rate: 2 / 3,
      reasonTermCoverage: 2 / 3,
      selectionAgreementRate: 2 / 3,
      successRate: 0.75,
      totalRuns: 4,
    });
    expect(metrics.perCase[0]).toMatchObject({
      expectedHits: 2,
      failedRuns: 1,
      successfulRuns: 3,
    });
  });

  it("counts an out-of-candidate ID as invalid", () => {
    const metrics = computeJdMatchSyntheticMetrics(
      [CASE],
      [success(1, "jd-outside", "React 前端经验匹配")],
    );

    expect(metrics.candidateIdValidityRate).toBe(0);
    expect(metrics.expectedTop1Rate).toBe(0);
  });

  it("requires at least three runs per case in strict mode", () => {
    const metrics = computeJdMatchSyntheticMetrics(
      [CASE],
      [success(1, "jd-frontend", "React 前端经验匹配")],
    );

    expect(getJdMatchStrictFailures(metrics, 1)).toContain("strict 模式每个案例至少需要运行 3 次");
  });
});
