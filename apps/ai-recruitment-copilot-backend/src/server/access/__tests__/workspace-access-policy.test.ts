import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestWorkspaceAuthorizer } from "../workspace-access-policy";

const mocks = vi.hoisted(() => ({
  hasWorkspacePermission: vi.fn(),
  selectGroupRoles: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: mocks.selectGroupRoles })),
    })),
  },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-permissions", () => ({
  hasWorkspacePermission: mocks.hasWorkspacePermission,
}));

describe("createRequestWorkspaceAuthorizer", () => {
  beforeEach(() => {
    mocks.hasWorkspacePermission.mockReset();
    mocks.selectGroupRoles.mockReset();
  });

  it("applies recruiting group roles to the same resources for every request adapter", async () => {
    mocks.selectGroupRoles.mockResolvedValue([{ role: "viewer" }]);
    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "read", resource: "interview" })).resolves.toBe(true);
    await expect(authorize({ action: "update", resource: "interview" })).resolves.toBe(false);
    expect(mocks.hasWorkspacePermission).not.toHaveBeenCalled();
  });

  it("allows recruiting group writers and keeps the lookup pinned to the request workspace", async () => {
    mocks.selectGroupRoles.mockResolvedValue([{ role: "hr" }]);
    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "update", resource: "resumeLibrary" })).resolves.toBe(true);
    expect(mocks.selectGroupRoles).toHaveBeenCalledOnce();
  });

  it("delegates non-group and non-member permissions with an explicit organization", async () => {
    const headers = new Headers({ cookie: "session=test" });
    mocks.hasWorkspacePermission.mockResolvedValue(true);
    const authorize = createRequestWorkspaceAuthorizer({
      headers,
      memberRole: "admin",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "create", resource: "offer" })).resolves.toBe(true);
    expect(mocks.hasWorkspacePermission).toHaveBeenCalledWith({
      action: "create",
      headers,
      organizationId: "org-a",
      resource: "offer",
    });
    expect(mocks.selectGroupRoles).not.toHaveBeenCalled();
  });

  it("rejects no-access workspace roles without consulting other adapters", async () => {
    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "noAccess",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "read", resource: "interview" })).resolves.toBe(false);
    expect(mocks.hasWorkspacePermission).not.toHaveBeenCalled();
    expect(mocks.selectGroupRoles).not.toHaveBeenCalled();
  });
});
