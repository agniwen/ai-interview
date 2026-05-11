// src/lib/shared/__tests__/permissions.test.ts
//
// 权限矩阵的表驱动测试。每加一个角色就追加测试块，确保矩阵不会被无意改坏。

import { describe, expect, it } from "vitest";
import { roles } from "@/lib/shared/permissions";

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

    it("can create+update interview/jd but not delete", () => {
      const { hr } = roles;
      expect(hr.statements.interview).toEqual(expect.arrayContaining(["create", "read", "update"]));
      expect(hr.statements.interview).not.toContain("delete");
      expect(hr.statements.jd).toEqual(expect.arrayContaining(["create", "read", "update"]));
      expect(hr.statements.jd).not.toContain("delete");
    });

    it("can fully manage candidateForm and questionTemplate", () => {
      const { hr } = roles;
      expect(hr.statements.candidateForm).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
      expect(hr.statements.questionTemplate).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("can only read department/interviewer/globalConfig, no write", () => {
      const { hr } = roles;
      expect(hr.statements.department).toEqual(["read"]);
      expect(hr.statements.interviewer).toEqual(["read"]);
      expect(hr.statements.globalConfig).toEqual(["read"]);
    });

    it("has full chat CRUD", () => {
      expect(roles.hr.statements.chat).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("has no auditLog access", () => {
      const stmts = roles.hr.statements as Record<string, readonly string[] | undefined>;
      expect(stmts.auditLog).toBeUndefined();
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
    ["hr", "interview", "delete", false],
    ["viewer", "interview", "delete", false],
    ["viewer", "interview", "read", true],
    // jd
    ["hr", "jd", "update", true],
    ["hr", "jd", "delete", false],
    ["viewer", "jd", "update", false],
    // department / interviewer
    ["hr", "department", "create", false],
    ["hr", "interviewer", "update", false],
    ["admin", "department", "delete", true],
    // candidateForm / questionTemplate
    ["hr", "candidateForm", "delete", true],
    ["viewer", "candidateForm", "delete", false],
    ["hr", "questionTemplate", "delete", true],
    // globalConfig
    ["hr", "globalConfig", "update", false],
    ["admin", "globalConfig", "update", true],
    ["viewer", "globalConfig", "read", true],
    // auditLog
    ["owner", "auditLog", "read", true],
    ["admin", "auditLog", "read", true],
    ["hr", "auditLog", "read", false],
    ["viewer", "auditLog", "read", false],
    // chat — 全员可全 CRUD
    ["viewer", "chat", "delete", true],
  ];

  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "can" : "cannot"} ${action} ${resource}`, () => {
      const stmts = roles[role].statements as Record<string, readonly string[] | undefined>;
      const allowed = stmts[resource]?.includes(action) ?? false;
      expect(allowed).toBe(expected);
    });
  }
});
