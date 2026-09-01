import { describe, expect, it } from "vitest";

import {
  buildWorkspaceMemberListQuery,
  getPageAfterMemberRemoval,
  reconcileGroupNameDraftState,
  resolveGroupNameDrafts,
} from "./members-page-model";

describe("workspace member list query", () => {
  it("uses join-time defaults and forwards selected activity sorting", () => {
    expect(
      buildWorkspaceMemberListQuery({
        filters: { textFilters: "" },
        page: 1,
        pageSize: 10,
        search: "",
        sortBy: undefined,
        sortOrder: undefined,
      }),
    ).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: "createdAt",
      sortOrder: "desc",
      textFilters: undefined,
    });
    expect(
      buildWorkspaceMemberListQuery({
        filters: { textFilters: '{"name":"张"}' },
        page: 2,
        pageSize: 20,
        search: "",
        sortBy: "lastActiveAt",
        sortOrder: "asc",
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      sortBy: "lastActiveAt",
      sortOrder: "asc",
      textFilters: '{"name":"张"}',
    });
  });

  it("returns to the previous page after removing the last row on a later page", () => {
    expect(getPageAfterMemberRemoval({ page: 3, visibleRowCount: 1 })).toBe(2);
    expect(getPageAfterMemberRemoval({ page: 3, visibleRowCount: 2 })).toBe(3);
    expect(getPageAfterMemberRemoval({ page: 1, visibleRowCount: 1 })).toBe(1);
  });
});

describe("resolveGroupNameDrafts", () => {
  it("follows server names until the user edits, then keeps only visible user drafts", () => {
    expect(resolveGroupNameDrafts([{ id: "group-1", name: "初始组名" }], {})).toEqual({
      "group-1": "初始组名",
    });
    expect(resolveGroupNameDrafts([{ id: "group-1", name: "服务端新名称" }], {})).toEqual({
      "group-1": "服务端新名称",
    });
    expect(
      resolveGroupNameDrafts([{ id: "group-1", name: "再次服务端更新" }], {
        "group-1": "用户草稿",
      }),
    ).toEqual({ "group-1": "用户草稿" });
    expect(resolveGroupNameDrafts([], { "group-1": "已删除组草稿" })).toEqual({});
  });

  it("drops hidden drafts before the same group id can reappear", () => {
    const edited = {
      drafts: { "group-1": "旧工作区草稿" },
      groupIdsKey: JSON.stringify(["group-1"]),
      workspaceId: "workspace-a",
    };

    const switched = reconcileGroupNameDraftState([], "workspace-b", edited);
    const returned = reconcileGroupNameDraftState([{ id: "group-1" }], "workspace-a", switched);

    expect(returned.drafts).toEqual({});
    expect(
      resolveGroupNameDrafts([{ id: "group-1", name: "服务端最新名称" }], returned.drafts),
    ).toEqual({ "group-1": "服务端最新名称" });
  });
});
