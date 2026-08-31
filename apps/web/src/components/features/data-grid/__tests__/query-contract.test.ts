import { describe, expect, it } from "vitest";
import {
  buildDataGridQueryKey,
  buildInfiniteDataGridQueryKey,
  normalizeDataGridQueryState,
  parseDataGridSearchParams,
} from "@/components/features/data-grid/query-contract";
import { buildDataGridFilterResetSignature } from "@/components/features/data-grid/use-data-grid-state";

describe("data grid query contract", () => {
  it("parses URL search params into the same state shape used by query keys", () => {
    const state = parseDataGridSearchParams(
      {
        creatorIds: "u_1,u_2",
        page: "3",
        pageSize: "25",
        search: "  前端工程师  ",
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "completed",
      },
      {
        defaultPageSize: 10,
        defaultSorting: [{ desc: true, id: "createdAt" }],
        initialFilters: { creatorIds: "", status: "" },
      },
    );

    expect(state).toEqual({
      filters: { creatorIds: "u_1,u_2", status: "completed" },
      page: 3,
      pageSize: 25,
      search: "前端工程师",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("falls back to default pagination, filters, and sort for missing or invalid URL params", () => {
    const state = parseDataGridSearchParams(
      {
        departmentId: undefined,
        page: "0",
        pageSize: "not-a-number",
        search: "   ",
        sortBy: "",
        sortOrder: "sideways",
      },
      {
        allowedSortIds: ["createdAt", "name"],
        defaultPageSize: 20,
        defaultSorting: [{ desc: false, id: "name" }],
        initialFilters: { departmentId: "", interviewerId: "" },
      },
    );

    expect(state).toEqual({
      filters: { departmentId: "", interviewerId: "" },
      page: 1,
      pageSize: 20,
      search: "",
      sortBy: "name",
      sortOrder: "asc",
    });
  });

  it("uses strict decimal pagination parsing so route loaders and client state agree", () => {
    const state = parseDataGridSearchParams(
      {
        page: "0x10",
        pageSize: "0x20",
      },
      {
        defaultPageSize: 20,
        initialFilters: {},
      },
    );

    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(20);
  });

  it("accepts TanStack Router JSON search primitives for pagination", () => {
    const state = parseDataGridSearchParams(
      {
        page: 2,
        pageSize: 25,
      },
      {
        defaultPageSize: 20,
        initialFilters: {},
      },
    );

    expect(state.page).toBe(2);
    expect(state.pageSize).toBe(25);
  });

  it("caps page size to the route-safe maximum", () => {
    const state = parseDataGridSearchParams(
      {
        pageSize: "100000",
      },
      {
        defaultPageSize: 10,
        initialFilters: {},
        maxPageSize: 100,
      },
    );

    expect(state.pageSize).toBe(100);
  });

  it("normalizes invalid client sort order before building query params", () => {
    const state = normalizeDataGridQueryState(
      {
        filters: {},
        page: 1,
        pageSize: 10,
        search: "",
        sortBy: "createdAt",
        // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
        sortOrder: "sideways" as never,
      },
      {
        fallbackSortOrder: "desc",
      },
    );

    expect(state.sortOrder).toBe("desc");
  });

  it("falls back to the default sort when URL sortBy is not in the allowlist", () => {
    const state = parseDataGridSearchParams(
      {
        sortBy: "not-a-column",
        sortOrder: "desc",
      },
      {
        allowedSortIds: ["createdAt", "updatedAt"],
        defaultSorting: [{ desc: true, id: "createdAt" }],
        initialFilters: {},
      },
    );

    expect(state.sortBy).toBe("createdAt");
    expect(state.sortOrder).toBe("desc");
  });

  it("builds a prefix-invalidation-friendly query key with normalized state", () => {
    const key = buildDataGridQueryKey(["studio-interviews", "acme"], {
      filters: { creatorIds: "u_1", status: "" },
      page: 2,
      pageSize: 10,
      search: " candidate ",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(key).toEqual([
      "studio-interviews",
      "acme",
      {
        filters: { creatorIds: "u_1", status: "" },
        page: 2,
        pageSize: 10,
        search: "candidate",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    ]);
  });

  it("builds an infinite-list key without pagination state", () => {
    const key = buildInfiniteDataGridQueryKey(["studio-resumes", "acme"], {
      filters: { creatorIds: "u_1", jdIds: "", skills: "React", stage: "screening" },
      search: " candidate ",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(key).toEqual([
      "studio-resumes",
      "acme",
      "infinite",
      {
        filters: { creatorIds: "u_1", jdIds: "", skills: "React", stage: "screening" },
        search: "candidate",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    ]);
  });

  it("keeps the filter reset signature stable across object key order changes", () => {
    const first = buildDataGridFilterResetSignature({
      filterKeys: ["creatorIds", "status"],
      filters: { creatorIds: "u_1", status: "completed" },
      search: " candidate ",
    });
    const second = buildDataGridFilterResetSignature({
      filterKeys: ["creatorIds", "status"],
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      filters: Object.fromEntries([
        ["status", "completed"],
        ["creatorIds", "u_1"],
      ]) as { creatorIds: string; status: string },
      search: "candidate",
    });

    expect(second).toBe(first);
  });

  it("ignores detail-only URL params when parsing data grid state", () => {
    const state = parseDataGridSearchParams(
      {
        page: "4",
        recordId: "resume_1",
        roundId: "round_1",
        templateId: "template_1",
      },
      {
        defaultPageSize: 10,
        initialFilters: { creatorIds: "", status: "" },
      },
    );

    expect(state.page).toBe(4);
    expect(state.filters).toEqual({ creatorIds: "", status: "" });
  });
});
