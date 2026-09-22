import { describe, expect, it } from "vitest";
import { buildRecruitingLedgerParams } from "./recruiting-ledger-query";

const candidateFilters = {
  createdFrom: "2026-09-01",
  createdTo: "2026-09-21",
  joiningFrom: "2026-10-01",
  joiningTo: "2026-10-31",
  page: 3,
  recommendationLevel: ["recommended"],
  responsibleHrId: ["hr-1"],
  search: "候选人",
  sortBy: "joiningDate" as const,
  sortOrder: "asc" as const,
  stage: "interview:second" as const,
};

describe("recruiting ledger request params", () => {
  it("keeps candidate filters in record view", () => {
    expect(
      buildRecruitingLedgerParams({
        ...candidateFilters,
        departmentId: ["department-1"],
        jobDescriptionId: ["job-1"],
        recruitingStatus: ["active"],
        view: "records",
      }),
    ).toMatchObject({
      boardView: "interview:second",
      createdFrom: "2026-09-01",
      joiningTo: "2026-10-31",
      page: 3,
      recommendationLevels: ["recommended"],
      responsibleHrIds: ["hr-1"],
      search: "候选人",
    });
  });

  it("only sends job dimensions in job summary view", () => {
    expect(
      buildRecruitingLedgerParams({
        ...candidateFilters,
        departmentId: ["department-1"],
        jobDescriptionId: ["job-1"],
        recruitingStatus: ["paused"],
        view: "jobs",
      }),
    ).toEqual({
      departmentIds: ["department-1"],
      jobDescriptionIds: ["job-1"],
      page: 1,
      pageSize: 20,
      recruitingStatuses: ["paused"],
    });
  });
});
