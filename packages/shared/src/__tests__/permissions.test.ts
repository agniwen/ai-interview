// src/lib/shared/__tests__/permissions.test.ts
//
// 权限矩阵的表驱动测试。每加一个角色就追加测试块，确保矩阵不会被无意改坏。

import { describe, expect, it } from "vitest";
import { roles } from "@arc/shared/permissions";

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
  });

  describe("hr role", () => {
    it("exists", () => {
      expect(roles.hr).toBeDefined();
    });

    it("can write all business resources like admin", () => {
      const { hr } = roles;
      const resources = [
        "interview",
        "jd",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(hr.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can update globalConfig and read auditLog", () => {
      expect(roles.hr.statements.globalConfig).toEqual(expect.arrayContaining(["read", "update"]));
      expect(roles.hr.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
    });

    it("has no member management access", () => {
      const stmts = roles.hr.statements as Record<string, readonly string[] | undefined>;
      expect(stmts.member ?? []).toHaveLength(0);
    });
  });

  describe("viewer role", () => {
    it("exists", () => {
      expect(roles.viewer).toBeDefined();
    });

    it("is read-only across business resources", () => {
      const { viewer } = roles;
      const readOnly = [
        "interview",
        "jd",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
      ] as const;
      for (const r of readOnly) {
        expect(viewer.statements[r]).toEqual(["read"]);
      }
    });

    it("still has full chat CRUD", () => {
      expect(roles.viewer.statements.chat).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("can read globalConfig but not update", () => {
      const { viewer } = roles;
      expect(viewer.statements.globalConfig).toEqual(["read"]);
    });

    it("has no auditLog access", () => {
      const stmts = roles.viewer.statements as Record<string, readonly string[] | undefined>;
      expect(stmts.auditLog).toBeUndefined();
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
    ["hr", "interview", "delete", true],
    ["viewer", "interview", "delete", false],
    ["viewer", "interview", "read", true],
    // jd
    ["hr", "jd", "update", true],
    ["hr", "jd", "delete", true],
    ["viewer", "jd", "update", false],
    // department / interviewer
    ["hr", "department", "create", true],
    ["hr", "interviewer", "update", true],
    ["admin", "department", "delete", true],
    // candidateForm / questionTemplate
    ["hr", "candidateForm", "delete", true],
    ["viewer", "candidateForm", "delete", false],
    ["hr", "questionTemplate", "delete", true],
    // globalConfig
    ["hr", "globalConfig", "update", true],
    ["admin", "globalConfig", "update", true],
    ["viewer", "globalConfig", "read", true],
    // auditLog
    ["owner", "auditLog", "read", true],
    ["admin", "auditLog", "read", true],
    ["hr", "auditLog", "read", true],
    ["viewer", "auditLog", "read", false],
    // chat — 全员可全 CRUD
    ["viewer", "chat", "delete", true],
    // member — 改角色 (update) owner / admin 均可（admin 的目标范围由服务端
    // hook 进一步限制为 hr/viewer，矩阵这里只给动词）；邀请/移除 admin 也可。
    ["owner", "member", "update", true],
    // admin 现在拥有 member.update 这个动词权限；具体能改谁、能改成什么角色的
    // 硬约束在服务端 hook（beforeUpdateMemberRole）里执行，矩阵这里只授予动词。
    // admin can now perform member.update; the actual target/role ceiling
    // (hr/viewer only, no self, no peer-admin) lives in the server-side hook.
    ["admin", "member", "update", true],
    ["hr", "member", "update", false],
    ["viewer", "member", "update", false],
    ["admin", "member", "create", true],
    ["admin", "member", "delete", true],
    ["hr", "member", "create", false],
    ["hr", "member", "delete", false],
  ];

  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "can" : "cannot"} ${action} ${resource}`, () => {
      const stmts = roles[role].statements as Record<string, readonly string[] | undefined>;
      const allowed = stmts[resource]?.includes(action) ?? false;
      expect(allowed).toBe(expected);
    });
  }
});
