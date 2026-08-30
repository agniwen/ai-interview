import { describe, expect, it } from "vitest";

import { reconcileGroupNameDraftState, resolveGroupNameDrafts } from "./members-page-model";

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
