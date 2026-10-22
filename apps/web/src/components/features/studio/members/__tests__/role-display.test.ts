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
        description:
          "负责日常招聘，可维护岗位、部门、面试官 Agent、沟通题和表单题；不能删除数据，能看到自己和全部下级的招聘数据。",
        label: "招聘专员",
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
