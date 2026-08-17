import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeWorkspacePermissionSnapshot } from "../workspace-permission-snapshot";

const mocks = {
  listGroupRoles: vi.fn(),
  loadDynamicRolePermission: vi.fn(),
};

function computeSnapshot(input: { memberRole: string; organizationId: string; userId: string }) {
  return computeWorkspacePermissionSnapshot(input, mocks);
}

describe("computeWorkspacePermissionSnapshot", () => {
  beforeEach(() => {
    mocks.listGroupRoles.mockReset();
    mocks.loadDynamicRolePermission.mockReset();
  });

  it("returns empty statements for noAccess", async () => {
    const snapshot = await computeSnapshot({
      memberRole: "noAccess",
      organizationId: "org-a",
      userId: "user-a",
    });
    expect(snapshot).toEqual({ role: "noAccess", statements: {} });
    expect(mocks.listGroupRoles).not.toHaveBeenCalled();
  });

  it("returns built-in admin matrix without consulting recruiting groups", async () => {
    const snapshot = await computeSnapshot({
      memberRole: "admin",
      organizationId: "org-a",
      userId: "user-a",
    });

    expect(snapshot.role).toBe("admin");
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes", "permissions"]));
    expect(snapshot.statements.interview).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
    expect(mocks.listGroupRoles).not.toHaveBeenCalled();
  });

  it("replaces member recruiting resources with group grants only", async () => {
    mocks.listGroupRoles.mockResolvedValue(["viewer"]);

    const snapshot = await computeSnapshot({
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    expect(snapshot.statements.interview).toEqual(["read"]);
    expect(snapshot.statements.resumeLibrary).toEqual(["read"]);
    // Non-recruiting resources still come from the built-in member matrix.
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes", "members"]));
    expect(snapshot.statements.page).not.toEqual(expect.arrayContaining(["permissions"]));
    expect(snapshot.statements.offer).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("gives member recruiting writers full catalog actions on gated resources", async () => {
    mocks.listGroupRoles.mockResolvedValue(["hr"]);

    const snapshot = await computeSnapshot({
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    expect(snapshot.statements.resumePool).toEqual(
      expect.arrayContaining(["create", "read", "publish", "import", "delete"]),
    );
    expect(snapshot.statements.interview).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("clears recruiting resources when member has no group membership", async () => {
    mocks.listGroupRoles.mockResolvedValue([]);

    const snapshot = await computeSnapshot({
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    expect(snapshot.statements.interview).toBeUndefined();
    expect(snapshot.statements.resumeLibrary).toBeUndefined();
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes"]));
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
      userId: "user-a",
    });

    expect(snapshot.statements).toEqual({
      interview: ["read"],
      page: ["dashboard", "resumes"],
    });
    expect(mocks.listGroupRoles).not.toHaveBeenCalled();
  });
});
