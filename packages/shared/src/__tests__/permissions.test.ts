// src/lib/shared/__tests__/permissions.test.ts
//
// 权限矩阵的表驱动测试。每加一个角色就追加测试块，确保矩阵不会被无意改坏。

import { describe, expect, it } from "vitest";
import { roles, STUDIO_PAGE_PERMISSION_ACTIONS } from "@arc/shared/permissions";

describe("permissions matrix", () => {
  describe("owner role", () => {
    it("exists in roles map", () => {
      expect(roles.owner).toBeDefined();
    });

    it("can create/read/update/delete every business resource", () => {
      const { owner } = roles;
      const resources = [
        "interview",
        "jd",
        "resumeLibrary",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(owner.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can update globalConfig and read auditLog", () => {
      const { owner } = roles;
      expect(owner.statements.globalConfig).toEqual(expect.arrayContaining(["read", "update"]));
      expect(owner.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
    });

    it("can browse every studio page", () => {
      expect(roles.owner.statements.page).toEqual(
        expect.arrayContaining(["dashboard", "globalConfig", "mailIngestAccounts", "permissions"]),
      );
    });
  });

  describe("admin role", () => {
    it("exists", () => {
      expect(roles.admin).toBeDefined();
    });

    it("can write all business resources like owner", () => {
      const { admin } = roles;
      const resources = [
        "interview",
        "jd",
        "resumeLibrary",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(admin.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can update globalConfig and read auditLog", () => {
      expect(roles.admin.statements.globalConfig).toEqual(
        expect.arrayContaining(["read", "update"]),
      );
      expect(roles.admin.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
    });

    it("can browse every studio page", () => {
      expect(roles.admin.statements.page).toEqual(
        expect.arrayContaining(["dashboard", "globalConfig", "mailIngestAccounts", "permissions"]),
      );
    });
  });

  describe("member role", () => {
    it("exists", () => {
      expect(roles.member).toBeDefined();
    });

    it("can access business resources; data scope is enforced by recruiting groups", () => {
      const { member } = roles;
      const resources = [
        "interview",
        "jd",
        "resumeLibrary",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(member.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can update globalConfig and read auditLog", () => {
      expect(roles.member.statements.globalConfig).toEqual(
        expect.arrayContaining(["read", "update"]),
      );
      expect(roles.member.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
    });

    it("has no member management access", () => {
      const stmts = roles.member.statements as Record<string, readonly string[] | undefined>;
      expect(stmts.member ?? []).toHaveLength(0);
    });

    it("cannot browse admin-only studio pages", () => {
      expect(roles.member.statements.page).not.toEqual(
        expect.arrayContaining(["dashboard", "globalConfig", "mailIngestAccounts", "permissions"]),
      );
      expect(roles.member.statements.page).toEqual(
        expect.arrayContaining(["resumes", "resumePool", "interviews", "members"]),
      );
    });
  });

  describe("noAccess role", () => {
    it("exists", () => {
      expect(roles.noAccess).toBeDefined();
    });

    it("has no studio page access", () => {
      for (const action of STUDIO_PAGE_PERMISSION_ACTIONS) {
        expect(roles.noAccess.statements.page?.includes(action)).toBe(false);
      }
    });

    it("has no business or member-management permissions", () => {
      const stmts = roles.noAccess.statements as Record<string, readonly string[] | undefined>;
      const resources = [
        "auditLog",
        "candidateForm",
        "chat",
        "department",
        "globalConfig",
        "interview",
        "interviewer",
        "humanInterview",
        "offer",
        "invitation",
        "jd",
        "member",
        "organization",
        "questionTemplate",
        "resumeLibrary",
        "resumePool",
        "resumeUploadBatch",
      ] as const;
      for (const resource of resources) {
        expect(stmts[resource] ?? []).toHaveLength(0);
      }
    });
  });
});

describe("permission matrix cross-cut", () => {
  // [role, resource, action, expected]
  // 这张表跟 spec §3.2 1:1 对齐，是回归防线。
  const cases: [keyof typeof roles, string, string, boolean][] = [
    // interview
    ["owner", "interview", "delete", true],
    ["admin", "interview", "delete", true],
    ["member", "interview", "delete", true],
    // jd
    ["member", "jd", "update", true],
    ["member", "jd", "delete", true],
    // resume library / pool / upload batches split
    ["member", "resumeLibrary", "read", true],
    ["member", "resumeLibrary", "update", true],
    ["member", "resumePool", "read", true],
    ["member", "resumePool", "publish", true],
    ["member", "resumePool", "import", true],
    ["member", "resumeUploadBatch", "process", true],
    ["member", "resumeUploadBatch", "cancel", true],
    ["admin", "mailIngestAccount", "manage", true],
    ["member", "mailIngestAccount", "manage", false],
    ["member", "mailIngestAccount", "create", false],
    // department / interviewer
    ["member", "department", "create", true],
    ["member", "interviewer", "update", true],
    ["admin", "department", "delete", true],
    // later-stage workflow controls
    ["admin", "humanInterview", "create", true],
    ["admin", "humanInterview", "read", true],
    ["admin", "humanInterview", "update", true],
    ["admin", "humanInterview", "delete", true],
    ["member", "humanInterview", "create", true],
    ["member", "humanInterview", "read", true],
    ["member", "humanInterview", "update", true],
    ["member", "humanInterview", "delete", true],
    ["noAccess", "humanInterview", "read", false],
    ["admin", "offer", "create", true],
    ["admin", "offer", "read", true],
    ["admin", "offer", "update", true],
    ["admin", "offer", "delete", true],
    ["member", "offer", "create", true],
    ["member", "offer", "read", true],
    ["member", "offer", "update", true],
    ["member", "offer", "delete", true],
    ["noAccess", "offer", "read", false],
    // candidateForm / questionTemplate
    ["member", "candidateForm", "delete", true],
    ["member", "questionTemplate", "delete", true],
    // globalConfig
    ["member", "globalConfig", "update", true],
    ["admin", "globalConfig", "update", true],
    // auditLog
    ["owner", "auditLog", "read", true],
    ["admin", "auditLog", "read", true],
    ["member", "auditLog", "read", true],
    // chat — 全员可全 CRUD
    ["member", "chat", "delete", true],
    // member — 改角色 (update) owner / admin 均可（admin 的目标范围由服务端
    // hook 进一步限制为非管理角色，矩阵这里只给动词）；邀请/移除 admin 也可。
    ["owner", "member", "update", true],
    // admin 现在拥有 member.update 这个动词权限；具体能改谁、能改成什么角色的
    // 硬约束在服务端 hook（beforeUpdateMemberRole）里执行，矩阵这里只授予动词。
    // admin can now perform member.update; the actual target/role ceiling
    // (non-admin targets only, no self, no peer-admin) lives in the server-side hook.
    ["admin", "member", "update", true],
    ["member", "member", "update", false],
    ["admin", "member", "create", true],
    ["admin", "member", "delete", true],
    ["member", "member", "create", false],
    ["member", "member", "delete", false],
    // page browsing
    ["admin", "page", "dashboard", true],
    ["admin", "page", "mailIngestAccounts", true],
    ["member", "page", "dashboard", false],
    ["member", "page", "mailIngestAccounts", false],
    ["member", "page", "permissions", false],
    ["member", "page", "globalConfig", false],
    ["member", "page", "resumes", true],
    ["member", "page", "members", true],
    ["noAccess", "page", "resumes", false],
    ["noAccess", "page", "members", false],
    ["noAccess", "member", "create", false],
    ["noAccess", "invitation", "create", false],
  ];

  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "can" : "cannot"} ${action} ${resource}`, () => {
      const stmts = roles[role].statements as Record<string, readonly string[] | undefined>;
      const allowed = stmts[resource]?.includes(action) ?? false;
      expect(allowed).toBe(expected);
    });
  }
});
