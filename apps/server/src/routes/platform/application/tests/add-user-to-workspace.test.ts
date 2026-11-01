import { describe, expect, it, vi } from "vitest";
import { AddUserToWorkspaceError, addUserToWorkspace } from "../add-user-to-workspace";
import type { AddUserToWorkspaceDependencies } from "../add-user-to-workspace";

function createDependencies(
  overrides: Partial<AddUserToWorkspaceDependencies> = {},
): AddUserToWorkspaceDependencies {
  return {
    addMember: vi.fn<AddUserToWorkspaceDependencies["addMember"]>().mockResolvedValue(),
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
  organizationId: "org-1",
  role: "member",
  userId: "user-1",
} as const;

describe("addUserToWorkspace", () => {
  it.each(["member", "admin", "noAccess"] as const)("adds a %s member", async (role) => {
    const dependencies = createDependencies();

    await expect(addUserToWorkspace({ ...input, role }, dependencies)).resolves.toEqual({
      organizationId: "org-1",
      organizationName: "研发部",
      organizationSlug: "rd",
      role,
    });
    expect(dependencies.addMember).toHaveBeenCalledWith({
      organizationId: "org-1",
      role,
      userId: "user-1",
    });
  });

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
