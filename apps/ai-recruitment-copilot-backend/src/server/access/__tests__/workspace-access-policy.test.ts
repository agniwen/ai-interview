import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestWorkspaceAuthorizer } from "../workspace-access-policy";

const mocks = vi.hoisted(() => ({
  computeWorkspacePermissionSnapshot: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-permission-snapshot", () => ({
  computeWorkspacePermissionSnapshot: mocks.computeWorkspacePermissionSnapshot,
}));

describe("createRequestWorkspaceAuthorizer", () => {
  beforeEach(() => {
    mocks.computeWorkspacePermissionSnapshot.mockReset();
  });

  it("authorizes from the shared permission snapshot and caches it per request", async () => {
    mocks.computeWorkspacePermissionSnapshot.mockResolvedValue({
      role: "member",
      statements: {
        interview: ["read"],
        resumeLibrary: ["read", "update"],
      },
    });

    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "read", resource: "interview" })).resolves.toBe(true);
    await expect(authorize({ action: "update", resource: "interview" })).resolves.toBe(false);
    await expect(authorize({ action: "update", resource: "resumeLibrary" })).resolves.toBe(true);

    expect(mocks.computeWorkspacePermissionSnapshot).toHaveBeenCalledOnce();
    expect(mocks.computeWorkspacePermissionSnapshot).toHaveBeenCalledWith({
      memberRole: "member",
      organizationId: "org-a",
      userId: "user-a",
    });
  });

  it("rejects no-access workspace roles without computing a snapshot", async () => {
    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "noAccess",
      organizationId: "org-a",
      userId: "user-a",
    });

    await expect(authorize({ action: "read", resource: "interview" })).resolves.toBe(false);
    expect(mocks.computeWorkspacePermissionSnapshot).not.toHaveBeenCalled();
  });

  it("rejects missing user identity without computing a snapshot", async () => {
    const authorize = createRequestWorkspaceAuthorizer({
      headers: new Headers({ cookie: "session=test" }),
      memberRole: "admin",
      organizationId: "org-a",
      userId: null,
    });

    await expect(authorize({ action: "create", resource: "offer" })).resolves.toBe(false);
    expect(mocks.computeWorkspacePermissionSnapshot).not.toHaveBeenCalled();
  });
});
