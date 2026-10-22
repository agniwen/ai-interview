import { describe, expect, it } from "vitest";

import { coerceWorkspaceManagementSearch } from "./workspace-management-search";

describe("workspace management search", () => {
  it("drops legacy tab values from the URL", () => {
    expect(coerceWorkspaceManagementSearch({})).toEqual({});
    expect(coerceWorkspaceManagementSearch({ tab: "members" })).toEqual({});
    expect(coerceWorkspaceManagementSearch({ tab: "groups" })).toEqual({});
  });

  it("preserves member pagination and sorting search state", () => {
    expect(
      coerceWorkspaceManagementSearch({
        page: 2,
        sortBy: "lastActiveAt",
        sortOrder: "asc",
        tab: "groups",
      }),
    ).toEqual({ page: 2, sortBy: "lastActiveAt", sortOrder: "asc" });
  });
});
