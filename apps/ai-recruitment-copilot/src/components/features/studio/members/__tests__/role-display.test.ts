import { describe, expect, it } from "vitest";
import { buildWorkspaceRoleOptions, getWorkspaceRoleLabel } from "../role-display";

describe("workspace role display", () => {
  it("keeps dynamic role identifiers as values and uses role names as labels", () => {
    const options = buildWorkspaceRoleOptions(
      ["member", "interview-reviewer"],
      [{ name: "面试审核员", role: "interview-reviewer" }],
    );

    expect(options).toEqual([
      {
        description: "可进入工作区；具体招聘权限由所在招聘组内的角色决定。",
        label: "普通成员",
        value: "member",
      },
      {
        description: "自定义工作区角色；具体权限由系统设置中的权限管理决定。",
        label: "面试审核员",
        value: "interview-reviewer",
      },
    ]);
  });

  it("falls back to identifier when a dynamic role name is not available", () => {
    expect(getWorkspaceRoleLabel("unknown-role")).toBe("unknown-role");
  });
});
