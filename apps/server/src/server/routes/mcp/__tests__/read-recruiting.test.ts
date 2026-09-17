import { describe, expect, it, vi } from "vitest";
import { createRecruitingReader } from "../application/read-recruiting";
import type { recruitingReadDependencies } from "../application/default-read-recruiting";
import type { WorkspaceAuthorizer } from "../../../access/workspace-access-policy";

type Dependencies = typeof recruitingReadDependencies;
function setup() {
  const deps = {
    getReport: vi.fn<Dependencies["getReport"]>(),
    listReports: vi.fn<Dependencies["listReports"]>(),
    loadCandidate: vi.fn<Dependencies["loadCandidate"]>(),
    loadJob: vi.fn<Dependencies["loadJob"]>(),
    searchCandidates: vi.fn<Dependencies["searchCandidates"]>(),
    searchJobs: vi.fn<Dependencies["searchJobs"]>(),
  };
  const authorize = vi.fn<WorkspaceAuthorizer>().mockResolvedValue(false);
  const visibility = { kind: "restricted" as const, userIds: ["recruiter-a"] };
  return {
    deps,
    reader: createRecruitingReader({ authorize, organizationId: "org-a", visibility }, deps),
    visibility,
  };
}

describe("MCP recruiting visibility", () => {
  it("cannot use report IDs to bypass candidate visibility", async () => {
    const { deps, reader, visibility } = setup();
    deps.loadCandidate.mockResolvedValue(null);
    await expect(
      reader.getReport({ candidateId: "foreign-candidate", kind: "ai", reportId: "known-report" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(deps.loadCandidate).toHaveBeenCalledWith("foreign-candidate", "org-a", visibility);
    expect(deps.getReport).not.toHaveBeenCalled();
    await expect(
      reader.listReports({ candidateId: "foreign-candidate", page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(deps.listReports).not.toHaveBeenCalled();
  });
  it("keeps search scoped to the grant and existing recruiting visibility", async () => {
    const { deps, reader, visibility } = setup();
    deps.searchCandidates.mockResolvedValue({
      page: 2,
      pageSize: 10,
      records: [],
      total: 0,
      totalPages: 0,
    });
    await reader.searchCandidates({ jobId: "job-a", page: 2, pageSize: 10, search: "张" });
    expect(deps.searchCandidates).toHaveBeenCalledWith(
      "org-a",
      { jobDescriptionIds: ["job-a"], pipelineStages: undefined, search: "张" },
      { jobId: "job-a", page: 2, pageSize: 10, search: "张" },
      visibility,
    );
  });
});
