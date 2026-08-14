import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RecruitingGroupAccess from "../recruiting-group-access";
import { computeWorkspacePermissionSnapshot } from "../workspace-permission-snapshot";

const mocks = vi.hoisted(() => ({
  listGroupRoles: vi.fn(),
  selectDynamicRole: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mocks.selectDynamicRole,
        })),
      })),
    })),
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-group-access", async () => {
  const actual = (await vi.importActual(
    "../recruiting-group-access",
  )) as typeof RecruitingGroupAccess;
  return {
    ...actual,
    listRecruitingGroupRoles: mocks.listGroupRoles,
  };
});

describe("computeWorkspacePermissionSnapshot", () => {
  beforeEach(() => {
    mocks.listGroupRoles.mockReset();
    mocks.selectDynamicRole.mockReset();
  });

  it("returns empty statements for noAccess", async () => {
    const snapshot = await computeWorkspacePermissionSnapshot({
      memberRole: "noAccess",
      organizationId: "org-a",
      userId: "user-a",
    });
    expect(snapshot).toEqual({ role: "noAccess", statements: {} });
    expect(mocks.listGroupRoles).not.toHaveBeenCalled();
  });

  it("returns built-in admin matrix without consulting recruiting groups", async () => {
    const snapshot = await computeWorkspacePermissionSnapshot({
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

    const snapshot = await computeWorkspacePermissionSnapshot({
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

    const snapshot = await computeWorkspacePermissionSnapshot({
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

    const snapshot = await computeWorkspacePermissionSnapshot({
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    expect(snapshot.statements.interview).toBeUndefined();
    expect(snapshot.statements.resumeLibrary).toBeUndefined();
    expect(snapshot.statements.page).toEqual(expect.arrayContaining(["resumes"]));
  });

  it("loads dynamic role permissions from organizationRole", async () => {
    mocks.selectDynamicRole.mockResolvedValue([
      {
        permission: JSON.stringify({
          interview: ["read"],
          page: ["dashboard", "resumes"],
        }),
      },
    ]);

    const snapshot = await computeWorkspacePermissionSnapshot({
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
