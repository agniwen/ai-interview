import { describe, expect, it, vi } from "vitest";
import type { RecruitingLedgerResult } from "@app/shared/studio-recruiting-ledger";
import { factory } from "../../../../../../factory";
import { createRecruitingLedgerRouter } from "./route";
import type { RecruitingLedgerRouterDependencies } from "./route";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://ledger-test:ledger-test@127.0.0.1:5432/ledger-test";
});

const EMPTY_RESULT: RecruitingLedgerResult = {
  facets: { departments: [], jobs: [], recruiters: [] },
  jobSummary: [],
  page: 1,
  pageSize: 20,
  records: [],
  total: 0,
  totalPages: 0,
};

describe("recruiting ledger route", () => {
  it("uses the current recruiting visibility scope and both read permissions", async () => {
    const permissionChecks: [string, string][] = [];
    const queryRecruitingLedger: RecruitingLedgerRouterDependencies["queryRecruitingLedger"] =
      vi.fn(() => Promise.resolve(EMPTY_RESULT));
    const resolveRecruitingVisibilityScope: RecruitingLedgerRouterDependencies["resolveRecruitingVisibilityScope"] =
      vi.fn(() => Promise.resolve({ kind: "restricted" as const, userIds: ["user-1"] }));
    const requirePermission: RecruitingLedgerRouterDependencies["requirePermission"] =
      (resource, action) => (_c, next) => {
        permissionChecks.push([resource, action]);
        return next();
      };
    const router = createRecruitingLedgerRouter({
      queryRecruitingLedger,
      requirePermission,
      resolveRecruitingVisibilityScope,
      setRecruitingLedgerInformationSync: vi.fn(),
    });
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: The focused route only reads these identity fields from the fixtures.
        c.set("activeOrg", { id: "org-1" } as never);
        // SAFETY: The focused route only reads member.role from this fixture.
        c.set("member", { role: "hr" } as never);
        // SAFETY: The focused route only reads user.id from this fixture.
        c.set("user", { id: "user-1" } as never);
        await next();
      })
      .route("/ledger", router);

    const response = await app.request(
      "/ledger?boardView=interview%3Asecond&createdFrom=2026-09-01&createdTo=2026-09-20&joiningFrom=2026-10-01&joiningTo=2026-10-31&departmentIds=department-1%2Cdepartment-2&jdIds=job-1%2Cjob-2&responsibleHrIds=hr-1%2Chr-2&recommendationLevels=recommended%2Chighly_recommended&recruitingStatuses=paused%2Cstopped&page=1&sortBy=joiningDate",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(EMPTY_RESULT);
    expect(permissionChecks).toEqual([
      ["page", "recruitingLedger"],
      ["resumeLibrary", "read"],
    ]);
    expect(resolveRecruitingVisibilityScope).toHaveBeenCalledWith({
      currentRole: "hr",
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(queryRecruitingLedger).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        boardView: "interview:second",
        createdAtBefore: new Date("2026-09-20T16:00:00.000Z"),
        createdAtFrom: new Date("2026-08-31T16:00:00.000Z"),
        departmentIds: ["department-1", "department-2"],
        jobDescriptionIds: ["job-1", "job-2"],
        joiningDateFrom: "2026-10-01",
        joiningDateTo: "2026-10-31",
        recommendationLevels: ["recommended", "highly_recommended"],
        recruitingStatuses: ["paused", "stopped"],
        responsibleHrIds: ["hr-1", "hr-2"],
      }),
      expect.objectContaining({ page: 1, pageSize: 20, sortBy: "joiningDate" }),
      { kind: "restricted", userIds: ["user-1"] },
    );
  });

  it("persists the information-sync tag independently from document sync", async () => {
    const setRecruitingLedgerInformationSync: RecruitingLedgerRouterDependencies["setRecruitingLedgerInformationSync"] =
      vi.fn(() => Promise.resolve({ informationSyncStatus: "synced" as const }));
    const router = createRecruitingLedgerRouter({
      queryRecruitingLedger: vi.fn(() => Promise.resolve(EMPTY_RESULT)),
      requirePermission: () => (_c, next) => next(),
      resolveRecruitingVisibilityScope: vi.fn(() =>
        Promise.resolve({ kind: "restricted" as const, userIds: ["user-1"] }),
      ),
      setRecruitingLedgerInformationSync,
    });
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: 此路由测试只读取工作区 id，夹具提供了所需字段。
        c.set("activeOrg", { id: "org-1" } as never);
        // SAFETY: 此路由测试只读取成员角色，夹具提供了所需字段。
        c.set("member", { role: "hr" } as never);
        // SAFETY: 此路由测试只读取用户 id，夹具提供了所需字段。
        c.set("user", { id: "user-1" } as never);
        await next();
      })
      .route("/ledger", router);

    const response = await app.request("/ledger/record-1/information-sync", {
      body: JSON.stringify({ synced: true }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ informationSyncStatus: "synced" });
    expect(setRecruitingLedgerInformationSync).toHaveBeenCalledWith({
      operatorId: "user-1",
      organizationId: "org-1",
      recordId: "record-1",
      scope: { kind: "restricted", userIds: ["user-1"] },
      synced: true,
    });
  });
});
