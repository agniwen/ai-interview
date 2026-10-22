// src/tests/permissions.test.ts
//
// 权限矩阵的表驱动测试。每加一个角色就追加测试块，确保矩阵不会被无意改坏。

import { describe, expect, it } from "vitest";
import {
  isWorkspaceAdministratorRole,
  roles,
  STUDIO_PAGE_PERMISSION_ACTIONS,
  STUDIO_PAGE_PERMISSION_LABELS,
} from "@app/shared/permissions";

describe("workspace administrator roles", () => {
  it("only treats owner and admin as administrators", () => {
    expect(isWorkspaceAdministratorRole("owner")).toBe(true);
    expect(isWorkspaceAdministratorRole("admin")).toBe(true);
    expect(isWorkspaceAdministratorRole("member")).toBe(false);
    expect(isWorkspaceAdministratorRole("recruiting-lead")).toBe(false);
  });
});

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
      expect(owner.statements.resumeEmailIngest).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("can browse every studio page", () => {
      expect(roles.owner.statements.page).toEqual(
        expect.arrayContaining([
          "calendar",
          "dashboard",
          "globalConfig",
          "offerApprovalTemplates",
          "permissions",
        ]),
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
      expect(roles.admin.statements.resumeEmailIngest).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("can browse every studio page", () => {
      expect(roles.admin.statements.page).toEqual([...STUDIO_PAGE_PERMISSION_ACTIONS]);
    });
  });

  describe("recruitingSupervisor role", () => {
    it("can fully manage recruiting work and configuration", () => {
      const { recruitingSupervisor } = roles;
      const resources = [
        "interview",
        "humanInterview",
        "offer",
        "jd",
        "resumeLibrary",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(recruitingSupervisor.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can decide offer approvals but not configure approval flows", () => {
      expect(roles.recruitingSupervisor.statements.offerApproval).toEqual([
        "create",
        "read",
        "decide",
      ]);
    });

    it("browses the dashboard and members but no administration pages", () => {
      expect(roles.recruitingSupervisor.statements.page).toEqual(
        expect.arrayContaining(["dashboard", "members", "calendar", "jobDescriptions"]),
      );
      for (const page of ["permissions", "globalConfig", "offerApprovalTemplates"] as const) {
        expect(roles.recruitingSupervisor.statements.page).not.toContain(page);
      }
    });
  });

  describe("member (recruiting specialist) role", () => {
    it("can create, read and update recruiting work and configuration without deleting", () => {
      const { member } = roles;
      const resources = [
        "interview",
        "humanInterview",
        "offer",
        "jd",
        "resumeLibrary",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
      ] as const;
      for (const r of resources) {
        expect(member.statements[r]).toEqual(["create", "read", "update"]);
      }
    });

    it("reads global config and manages their own mailbox ingest", () => {
      expect(roles.member.statements.globalConfig).toEqual(["read"]);
      expect(roles.member.statements.resumeEmailIngest).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    });

    it("has no member management access", () => {
      // SAFETY: The permission matrix fixture is owned by this test and exposes string-keyed statements.
      const stmts = roles.member.statements as Record<string, readonly string[] | undefined>;
      expect(stmts.member ?? []).toHaveLength(0);
    });

    it("browses daily recruiting and configuration pages only", () => {
      expect(roles.member.statements.page).toEqual(
        expect.arrayContaining([
          "resumes",
          "resumePool",
          "interviews",
          "calendar",
          "recruitingLedger",
          "departments",
          "interviewers",
          "jobDescriptions",
          "forms",
          "interviewQuestions",
        ]),
      );
      for (const page of ["dashboard", "members", "permissions", "globalConfig"] as const) {
        expect(roles.member.statements.page).not.toContain(page);
      }
    });
  });

  describe("interviewer role", () => {
    it("only opens interview management and the personal center", () => {
      expect(roles.interviewer.statements.page).toEqual(["calendar", "me"]);
    });

    it("has no recruiting resource permissions", () => {
      // SAFETY: The permission matrix fixture is owned by this test and exposes string-keyed statements.
      const stmts = roles.interviewer.statements as Record<string, readonly string[] | undefined>;
      for (const resource of ["chat", "interview", "jd", "resumeLibrary", "humanInterview"]) {
        expect(stmts[resource] ?? []).toHaveLength(0);
      }
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
      // SAFETY: The permission matrix fixture is owned by this test and exposes string-keyed statements.
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
        "resumeEmailIngest",
      ] as const;
      for (const resource of resources) {
        expect(stmts[resource] ?? []).toHaveLength(0);
      }
    });
  });
});

describe("permission matrix cross-cut", () => {
  it("uses the full recruiting ledger page label", () => {
    expect(STUDIO_PAGE_PERMISSION_LABELS.recruitingLedger).toBe("招聘台账");
  });

  // [role, resource, action, expected]
  // 这张表跟 spec §3.2 1:1 对齐，是回归防线。
  const cases: [keyof typeof roles, string, string, boolean][] = [
    // deletes stay with supervisors and administrators
    ["owner", "interview", "delete", true],
    ["admin", "interview", "delete", true],
    ["recruitingSupervisor", "interview", "delete", true],
    ["member", "interview", "delete", false],
    ["member", "resumeLibrary", "delete", false],
    ["member", "resumePool", "delete", false],
    ["member", "department", "delete", false],
    ["recruitingSupervisor", "resumePool", "delete", true],
    // recruiting specialists maintain configuration
    ["member", "jd", "create", true],
    ["member", "department", "update", true],
    ["member", "interviewer", "update", true],
    ["member", "candidateForm", "create", true],
    ["member", "questionTemplate", "update", true],
    ["member", "resumePool", "publish", true],
    ["member", "resumeUploadBatch", "cancel", true],
    // offer approvals
    ["admin", "offerApproval", "manage", true],
    ["recruitingSupervisor", "offerApproval", "decide", true],
    ["recruitingSupervisor", "offerApproval", "manage", false],
    ["member", "offerApproval", "create", true],
    ["member", "offerApproval", "decide", false],
    // global config
    ["admin", "globalConfig", "update", true],
    ["recruitingSupervisor", "globalConfig", "update", false],
    ["member", "globalConfig", "update", false],
    // member management stays with administrators; the hook limits admin targets
    ["owner", "member", "update", true],
    ["admin", "member", "update", true],
    ["recruitingSupervisor", "member", "update", false],
    ["member", "member", "update", false],
    ["admin", "invitation", "create", true],
    ["recruitingSupervisor", "invitation", "create", false],
    // page browsing
    ["admin", "page", "offerApprovalTemplates", true],
    ["recruitingSupervisor", "page", "offerApprovals", true],
    ["recruitingSupervisor", "page", "offerApprovalTemplates", false],
    ["member", "page", "offerApprovalTemplates", false],
    ["interviewer", "page", "calendar", true],
    ["interviewer", "page", "interviews", false],
    ["interviewer", "chat", "read", false],
    ["noAccess", "page", "calendar", false],
    ["noAccess", "member", "create", false],
    ["noAccess", "invitation", "create", false],
  ];

  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "can" : "cannot"} ${action} ${resource}`, () => {
      // SAFETY: The table only contains permission resources and actions from the fixture matrix.
      const stmts = roles[role].statements as Record<string, readonly string[] | undefined>;
      const allowed = stmts[resource]?.includes(action) ?? false;
      expect(allowed).toBe(expected);
    });
  }
});
