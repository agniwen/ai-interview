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
      expect(roles.hr.statements.auditLog).toBeUndefined();
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
      expect(roles.viewer.statements.auditLog).toBeUndefined();
    });
  });
});
