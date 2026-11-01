import { describe, expect, it } from "vitest";
import { canAssignWorkspaceRole } from "../workspace-roles";

function canAssign(invokerRole: string, targetRole: string) {
  return canAssignWorkspaceRole({ invokerRole, organizationId: "org-a", targetRole });
}

describe("canAssignWorkspaceRole for built-in roles", () => {
  it.each([
    ["owner", "admin"],
    ["admin", "recruitingSupervisor"],
    ["admin", "member"],
    ["admin", "interviewer"],
    ["admin", "noAccess"],
    ["recruitingSupervisor", "member"],
  ])("lets %s grant the lower-ranked %s role", async (invokerRole, targetRole) => {
    await expect(canAssign(invokerRole, targetRole)).resolves.toBe(true);
  });

  it.each([
    ["admin", "admin"],
    ["admin", "owner"],
    ["recruitingSupervisor", "recruitingSupervisor"],
    ["member", "recruitingSupervisor"],
    ["interviewer", "member"],
    ["noAccess", "interviewer"],
  ])("does not let %s grant %s", async (invokerRole, targetRole) => {
    await expect(canAssign(invokerRole, targetRole)).resolves.toBe(false);
  });
});
