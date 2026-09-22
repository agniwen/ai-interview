import { describe, expect, it } from "vitest";
import {
  calculateRecruitingCycleDays,
  calculateRecruitingGap,
  calculateRecruitingPoints,
  parseRecruitingLedgerJobStatuses,
  parseRecruitingLedgerRecommendationLevels,
  recruitingPriorityCoefficients,
  recruitingLedgerQuerySchema,
  summarizeActiveRecruitingJobs,
} from "@app/shared/studio-recruiting-ledger";

describe("recruiting ledger derived fields", () => {
  it("keeps an unconfigured headcount distinct from a completed hiring target", () => {
    expect(calculateRecruitingGap(null, 0)).toBeNull();
    expect(calculateRecruitingGap(3, 1)).toBe(2);
    expect(calculateRecruitingGap(1, 2)).toBe(0);
  });

  it("only awards weighted points to hired candidates", () => {
    expect(recruitingPriorityCoefficients).toEqual({ high: 1.5, low: 0.8, medium: 1 });
    expect(
      calculateRecruitingPoints({ jobPriority: "high", jobWeight: "2.00", outcome: "hired" }),
    ).toBe(3);
    expect(
      calculateRecruitingPoints({ jobPriority: "low", jobWeight: "1.25", outcome: "hired" }),
    ).toBe(1);
    expect(
      calculateRecruitingPoints({
        jobPriority: "high",
        jobWeight: "2.00",
        outcome: "in_pipeline",
      }),
    ).toBe(0);
  });

  it("freezes cycle days at close time", () => {
    expect(
      calculateRecruitingCycleDays({
        closedAt: "2026-09-11T00:00:00.000Z",
        createdAt: "2026-09-01T00:00:00.000Z",
        now: new Date("2026-09-20T00:00:00.000Z"),
      }),
    ).toBe(10);
  });

  it("drops unknown AI recommendation filters", () => {
    expect(parseRecruitingLedgerRecommendationLevels("recommended,unknown,undecided")).toEqual([
      "recommended",
      "undecided",
    ]);
  });

  it("keeps only supported job recruiting statuses", () => {
    expect(parseRecruitingLedgerJobStatuses("active,unknown,stopped")).toEqual([
      "active",
      "stopped",
    ]);
  });

  it("excludes paused and stopped jobs from active job totals", () => {
    const base = {
      active: 1,
      confirmed: 1,
      departmentName: null,
      gap: 2,
      headcount: 3,
      hired: 1,
      jobPriority: null,
      jobWeight: null,
      negativeClosed: 0,
      processDistribution: { closed: 0, interview: 0, offer: 0, onboarding: 0, screening: 0 },
      recruitingPoints: 0,
      total: 2,
    } as const;

    expect(
      summarizeActiveRecruitingJobs([
        { ...base, id: "active", name: "招聘中", recruitingStatus: "active" },
        { ...base, id: "paused", name: "已暂停", recruitingStatus: "paused" },
        { ...base, id: "stopped", name: "已停止", recruitingStatus: "stopped" },
      ]),
    ).toEqual({
      activeJobs: 1,
      configuredJobs: 1,
      confirmed: 1,
      totalDemand: 3,
      totalGap: 2,
      unconfiguredJobs: 0,
    });
  });

  it("validates created and joining date ranges independently", () => {
    expect(
      recruitingLedgerQuerySchema.safeParse({
        createdFrom: "2026-09-20",
        createdTo: "2026-09-01",
      }).success,
    ).toBe(false);
    expect(
      recruitingLedgerQuerySchema.safeParse({
        joiningFrom: "2026-10-01",
        joiningTo: "2026-10-31",
      }).success,
    ).toBe(true);
  });

  it("accepts joining date as a ledger sort field", () => {
    expect(recruitingLedgerQuerySchema.parse({ sortBy: "joiningDate" }).sortBy).toBe("joiningDate");
  });
});
