import { describe, expect, it, vi } from "vitest";
import { AddUserToWorkspaceError, addUserToWorkspace } from "../add-user-to-workspace";
import type { AddUserToWorkspaceDependencies } from "../add-user-to-workspace";

function createDependencies(
  overrides: Partial<AddUserToWorkspaceDependencies> = {},
): AddUserToWorkspaceDependencies {
  return {
    addMember: vi.fn<AddUserToWorkspaceDependencies["addMember"]>().mockResolvedValue(),
    addToDefaultRecruitingGroup: vi
      .fn<AddUserToWorkspaceDependencies["addToDefaultRecruitingGroup"]>()
      .mockResolvedValue(),
    findWorkspace: vi
      .fn<AddUserToWorkspaceDependencies["findWorkspace"]>()
      .mockResolvedValue({ id: "org-1", name: "研发部", slug: "rd" }),
    isWorkspaceMember: vi
      .fn<AddUserToWorkspaceDependencies["isWorkspaceMember"]>()
      .mockResolvedValue(false),
    userExists: vi.fn<AddUserToWorkspaceDependencies["userExists"]>().mockResolvedValue(true),
    ...overrides,
  };
}

const input = {
  actorUserId: "admin-1",
  organizationId: "org-1",
  role: "member",
  userId: "user-1",
} as const;

describe("addUserToWorkspace", () => {
  it("adds a regular member and joins the default recruiting group", async () => {
    const dependencies = createDependencies();

    await expect(addUserToWorkspace(input, dependencies)).resolves.toEqual({
      organizationId: "org-1",
      organizationName: "研发部",
      organizationSlug: "rd",
      role: "member",
    });
    expect(dependencies.addMember).toHaveBeenCalledWith({
      organizationId: "org-1",
      role: "member",
      userId: "user-1",
    });
    expect(dependencies.addToDefaultRecruitingGroup).toHaveBeenCalledWith({
      actorUserId: "admin-1",
      organizationId: "org-1",
      userId: "user-1",
    });
  });

  it.each(["admin", "noAccess"] as const)(
    "adds a %s without auto-joining the default recruiting group",
    async (role) => {
      const dependencies = createDependencies();

      await addUserToWorkspace({ ...input, role }, dependencies);

      expect(dependencies.addMember).toHaveBeenCalledWith({
        organizationId: "org-1",
        role,
        userId: "user-1",
      });
      expect(dependencies.addToDefaultRecruitingGroup).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["user_not_found", { userExists: vi.fn().mockResolvedValue(false) }],
    ["workspace_not_found", { findWorkspace: vi.fn().mockResolvedValue(null) }],
    ["already_member", { isWorkspaceMember: vi.fn().mockResolvedValue(true) }],
  ] as const)("rejects with %s without adding a member", async (reason, overrides) => {
    const dependencies = createDependencies(overrides);

    await expect(addUserToWorkspace(input, dependencies)).rejects.toEqual(
      new AddUserToWorkspaceError(reason),
    );
    expect(dependencies.addMember).not.toHaveBeenCalled();
  });
});
