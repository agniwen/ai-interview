import { describe, expect, it } from "vitest";

import {
  buildWorkspaceManagementSearch,
  coerceWorkspaceManagementSearch,
  parseWorkspaceManagementTab,
} from "./workspace-management-search";

describe("workspace management search", () => {
  it("keeps the default members tab out of the URL", () => {
    expect(coerceWorkspaceManagementSearch({})).toEqual({});
    expect(coerceWorkspaceManagementSearch({ tab: "members" })).toEqual({});
    expect(coerceWorkspaceManagementSearch({ tab: "unsupported" })).toEqual({});
    expect(parseWorkspaceManagementTab(null)).toBe("members");
  });

  it("round-trips the groups tab without dropping existing search state", () => {
    expect(coerceWorkspaceManagementSearch({ tab: "groups" })).toEqual({ tab: "groups" });
    expect(parseWorkspaceManagementTab("groups")).toBe("groups");
    expect(buildWorkspaceManagementSearch({}, "groups")).toEqual({ tab: "groups" });
    expect(buildWorkspaceManagementSearch({ tab: "groups" }, "members")).toEqual({});
  });

  it("preserves member pagination and sorting search state", () => {
    expect(
      coerceWorkspaceManagementSearch({
        page: 2,
        sortBy: "lastActiveAt",
        sortOrder: "asc",
        tab: "members",
      }),
    ).toEqual({ page: 2, sortBy: "lastActiveAt", sortOrder: "asc" });
    expect(
      buildWorkspaceManagementSearch({ page: 2, sortBy: "createdAt", sortOrder: "desc" }, "groups"),
    ).toEqual({ page: 2, sortBy: "createdAt", sortOrder: "desc", tab: "groups" });
  });
});
