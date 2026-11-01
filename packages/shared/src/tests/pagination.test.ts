import { describe, expect, it } from "vitest";
import {
  calcTotalPages,
  makePaginationSchema,
  paginationOffset,
  paginationSearchParams,
  toPaginatedResult,
} from "../pagination";

const schema = makePaginationSchema(["trashedAt", "savedAt", "title"] as const, {
  defaultSortBy: "trashedAt",
});

describe("shared pagination contract", () => {
  it("parses the same page and pageSize query shape for every list", () => {
    expect(schema.parse({ page: "2", pageSize: "20" })).toEqual({
      page: 2,
      pageSize: 20,
      sortBy: "trashedAt",
      sortOrder: "desc",
    });
    expect(schema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: "trashedAt",
      sortOrder: "desc",
    });
  });

  it("rejects a pageSize above the shared maximum", () => {
    expect(schema.safeParse({ pageSize: "101" }).success).toBe(false);
  });

  it("builds a stable query string and offset window", () => {
    expect(
      paginationSearchParams({
        page: 3,
        pageSize: 20,
        search: " 周会 ",
        sortBy: "trashedAt",
        sortOrder: "desc",
      }).toString(),
    ).toBe("page=3&pageSize=20&sortBy=trashedAt&sortOrder=desc&search=%E5%91%A8%E4%BC%9A");
    expect(paginationOffset(3, 20)).toBe(40);
    expect(toPaginatedResult(["a"], 21, 3, 10)).toEqual({
      page: 3,
      pageSize: 10,
      records: ["a"],
      total: 21,
      totalPages: 3,
    });
    expect(calcTotalPages(0, 10)).toBe(1);
  });
});
