import { describe, expect, it } from "vitest";
import {
  BUILT_IN_WORKSPACE_ROLE_NAMES,
  ROLE_ASSIGNED_TO_MEMBERS_MESSAGE,
  buildPermissionHeaderGroups,
  buildPermissionItems,
  canManageWorkspacePermissions,
  copyPermissionRecord,
  normalizeDynamicRoleName,
  readRoleDeleteError,
  sortDynamicWorkspaceRolesByCreatedAt,
} from "./workspace-role-permissions";

describe("workspace role permission helpers", () => {
  it("allows only workspace administrators to manage permissions", () => {
    expect(canManageWorkspacePermissions("owner")).toBe(true);
    expect(canManageWorkspacePermissions("admin")).toBe(true);
    expect(canManageWorkspacePermissions("member")).toBe(false);
    expect(canManageWorkspacePermissions("custom-reviewer")).toBe(false);
  });

  it("normalizes dynamic role names before checking built-in collisions", () => {
    expect(normalizeDynamicRoleName("  Interview Reviewer ")).toBe("interview-reviewer");
    expect(BUILT_IN_WORKSPACE_ROLE_NAMES.has(normalizeDynamicRoleName(" Admin "))).toBe(true);
    expect(BUILT_IN_WORKSPACE_ROLE_NAMES.has(normalizeDynamicRoleName("member"))).toBe(true);
    expect(BUILT_IN_WORKSPACE_ROLE_NAMES.has(normalizeDynamicRoleName("noAccess"))).toBe(true);
  });

  it("does not derive dynamic role identifiers from display names", () => {
    expect(normalizeDynamicRoleName("面试审核员")).toBe("面试审核员");
    expect(normalizeDynamicRoleName("interview reviewer")).toBe("interview-reviewer");
  });

  it("shows a local message when deleting a role assigned to members", () => {
    expect(readRoleDeleteError({ code: "ROLE_IS_ASSIGNED_TO_MEMBERS" })).toBe(
      ROLE_ASSIGNED_TO_MEMBERS_MESSAGE,
    );
    expect(
      readRoleDeleteError(
        new Error(
          "Cannot delete a role that is assigned to members. Please reassign the members to a different role first",
        ),
      ),
    ).toBe(ROLE_ASSIGNED_TO_MEMBERS_MESSAGE);
    expect(readRoleDeleteError(new Error("network failed"))).toBe("network failed");
  });

  it("sorts dynamic roles by creation time without mutating the source list", () => {
    const roles = [
      { createdAt: "2026-06-24T10:00:00.000Z", id: "role-b", role: "reviewer" },
      { createdAt: "2026-06-23T10:00:00.000Z", id: "role-a", role: "screener" },
      { createdAt: "2026-06-24T10:00:00.000Z", id: "role-c", role: "operator" },
    ];

    expect(sortDynamicWorkspaceRolesByCreatedAt(roles).map((role) => role.id)).toEqual([
      "role-a",
      "role-b",
      "role-c",
    ]);
    expect(roles.map((role) => role.id)).toEqual(["role-b", "role-a", "role-c"]);
  });

  it("expands legacy late-stage manage permissions to CRUD actions", () => {
    const permission = copyPermissionRecord({
      humanInterview: ["manage"],
      mailIngestAccount: ["manage"],
      offer: ["read", "manage"],
    });

    expect(permission.humanInterview).toEqual(["create", "read", "update", "delete"]);
    expect(permission.offer).toEqual(["read", "create", "update", "delete"]);
    expect(permission.mailIngestAccount).toEqual(["manage"]);
  });

  it("flattens permission groups into stable table columns", () => {
    const items = buildPermissionItems();

    expect(items[0]).toMatchObject({
      action: "resumes",
      description: expect.stringContaining("侧边栏"),
      groupTitle: "页面浏览",
      key: "page:resumes",
      label: "页面浏览 · 招聘",
      resource: "page",
    });
    expect(items.map((item) => item.key)).toContain("page:permissions");
    expect(items.map((item) => item.key)).toContain("resumeLibrary:read");
    expect(items.map((item) => item.key)).toContain("resumePool:import");
    expect(items.map((item) => item.key)).toContain("resumeUploadBatch:process");
    expect(items.map((item) => item.key)).toContain("humanInterview:create");
    expect(items.map((item) => item.key)).toContain("humanInterview:read");
    expect(items.map((item) => item.key)).toContain("humanInterview:update");
    expect(items.map((item) => item.key)).toContain("humanInterview:delete");
    expect(items.map((item) => item.key)).toContain("offer:create");
    expect(items.map((item) => item.key)).toContain("offer:read");
    expect(items.map((item) => item.key)).toContain("offer:update");
    expect(items.map((item) => item.key)).toContain("offer:delete");
    expect(items.map((item) => item.key)).toContain("mailIngestAccount:manage");
    expect(items.map((item) => item.key)).not.toContain("resume:read");
    expect(items.map((item) => item.key)).toContain("globalConfig:update");
  });

  it("groups permission columns by page for two-level table headers", () => {
    const groups = buildPermissionHeaderGroups(buildPermissionItems());
    const resumeLibraryGroup = groups.find((group) => group.resource === "resumeLibrary");
    const resumePoolGroup = groups.find((group) => group.resource === "resumePool");

    expect(groups[0]?.resource).toBe("page");
    expect(groups[0]?.resourceLabel).toBe("页面浏览");
    expect(groups[0]?.items.map((item) => item.action)).toContain("resumes");
    expect(groups[0]?.items.map((item) => item.action)).toContain("permissions");
    expect(resumeLibraryGroup?.items.map((item) => item.actionLabel)).toEqual([
      "新增",
      "查看",
      "编辑",
      "删除",
    ]);
    expect(resumePoolGroup?.items.map((item) => item.actionLabel)).toEqual([
      "上传",
      "查看",
      "发布",
      "导入",
      "删除",
    ]);
    expect(groups.find((group) => group.resource === "humanInterview")?.items).toHaveLength(4);
    expect(groups.find((group) => group.resource === "offer")?.items).toHaveLength(4);
    expect(groups.flatMap((group) => group.items).map((item) => item.key)).toEqual(
      buildPermissionItems().map((item) => item.key),
    );
  });

  it("describes where each permission item takes effect", () => {
    const items = buildPermissionItems();
    const resumeLibraryRead = items.find((item) => item.key === "resumeLibrary:read");
    const resumePoolRead = items.find((item) => item.key === "resumePool:read");
    const resumePoolPage = items.find((item) => item.key === "page:resumePool");
    const jobDescriptionPage = items.find((item) => item.key === "page:jobDescriptions");
    const jdRead = items.find((item) => item.key === "jd:read");

    expect(resumePoolPage?.description).toContain("访问「人才库」页面");
    expect(resumePoolPage?.description).toContain("数据接口仍受「人才库」业务权限控制");
    expect(resumePoolPage?.description).toContain("404");
    expect(resumeLibraryRead?.description).toContain("「招聘台」列表、详情、时间线");
    expect(resumeLibraryRead?.description).toContain("推荐候选人接口");
    expect(resumePoolRead?.description).toContain("「人才库」列表、详情、简历文件");
    expect(jobDescriptionPage?.description).toContain("推荐候选人还需要「招聘台」查看权限");
    expect(jdRead?.description).toContain("推荐候选人接口还同时需要「招聘台」查看权限");
  });
});
