import { describe, expect, it } from "vitest";
import { recruitingLedgerSearchSchema } from "./w.$slug.studio.recruiting-ledger";

describe("recruiting ledger search params", () => {
  it("opens HR statistics by default and preserves explicit view links", () => {
    expect(recruitingLedgerSearchSchema.parse({}).view).toBe("hr");
    expect(recruitingLedgerSearchSchema.parse({ view: "records" }).view).toBe("records");
    expect(recruitingLedgerSearchSchema.parse({ view: "jobs" }).view).toBe("jobs");
  });

  it("keeps multiple values for each ledger filter", () => {
    const search = recruitingLedgerSearchSchema.parse({
      departmentId: ["department-1", "department-2"],
      jobDescriptionId: ["job-1", "job-2"],
      recommendationLevel: ["recommended", "highly_recommended"],
      recruitingStatus: ["paused", "stopped"],
      responsibleHrId: ["hr-1", "hr-2"],
    });

    expect(search).toMatchObject({
      departmentId: ["department-1", "department-2"],
      jobDescriptionId: ["job-1", "job-2"],
      recommendationLevel: ["recommended", "highly_recommended"],
      recruitingStatus: ["paused", "stopped"],
      responsibleHrId: ["hr-1", "hr-2"],
    });
  });

  it("keeps old single-value links working and removes duplicate or blank values", () => {
    const search = recruitingLedgerSearchSchema.parse({
      departmentId: "department-1",
      jobDescriptionId: ["job-1", "job-1", " "],
      recommendationLevel: "recommended",
      recruitingStatus: "active",
      responsibleHrId: "hr-1",
    });

    expect(search).toMatchObject({
      departmentId: ["department-1"],
      jobDescriptionId: ["job-1"],
      recommendationLevel: ["recommended"],
      recruitingStatus: ["active"],
      responsibleHrId: ["hr-1"],
    });
  });
});
