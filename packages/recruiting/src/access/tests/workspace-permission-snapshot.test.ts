import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeWorkspacePermissionSnapshot } from "../workspace-permission-snapshot";

const mocks = {
  loadDynamicRolePermission: vi.fn(),
};

function computeSnapshot(input: { memberRole: string; organizationId: string }) {
  return computeWorkspacePermissionSnapshot(input, mocks);
}

describe("computeWorkspacePermissionSnapshot", () => {
  beforeEach(() => {
    mocks.loadDynamicRolePermission.mockReset();
  });

  it("returns empty statements for noAccess", async () => {
    const snapshot = await computeSnapshot({
      memberRole: "noAccess",
      organizationId: "org-a",
    });
    expect(snapshot).toEqual({ role: "noAccess", statements: {} });
  });

  it("returns the built-in admin matrix", async () => {
    const snapshot = await computeSnapshot({
      memberRole: "admin",
      organizationId: "org-a",
    });

    expect(snapshot.role).toBe("admin");
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes", "permissions"]));
    expect(snapshot.statements.interview).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
    expect(snapshot.statements.resumeEmailIngest).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("grants recruiting specialists the built-in member matrix directly", async () => {
    const snapshot = await computeSnapshot({
      memberRole: "member",
      organizationId: "org-a",
    });

    expect(snapshot.statements.resumeLibrary).toEqual(["create", "read", "update"]);
    expect(snapshot.statements.resumePool).toEqual(["create", "read", "publish", "import"]);
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes", "calendar"]));
    expect(snapshot.statements.page).not.toEqual(expect.arrayContaining(["permissions"]));
    expect(snapshot.statements.offerApproval).toEqual(["create", "read"]);
    expect(mocks.loadDynamicRolePermission).not.toHaveBeenCalled();
  });

  it("loads dynamic role permissions from organizationRole", async () => {
    mocks.loadDynamicRolePermission.mockResolvedValue(
      JSON.stringify({
        interview: ["read"],
        page: ["dashboard", "resumes"],
      }),
    );

    const snapshot = await computeSnapshot({
      memberRole: "custom-lead",
      organizationId: "org-a",
    });

    expect(snapshot.statements).toEqual({
      interview: ["read"],
      page: ["dashboard", "resumes"],
    });
  });
});
