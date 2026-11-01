import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../../../factory";
import { createWorkspaceMembersRouter } from "../route";
import type { WorkspaceMembersRouterDependencies } from "../route";

const permissionChecks: [string, string][] = [];

const dependencies = {
  feishuHumanInterviewEnabled: vi.fn(() => true),
  listDirectory: vi.fn<WorkspaceMembersRouterDependencies["listDirectory"]>(),
  listOptions: vi.fn<WorkspaceMembersRouterDependencies["listOptions"]>(),
  // SAFETY: The stub has the same (resource, action) => middleware shape as requirePermission;
  // the cast only widens its parameter types for recording calls.
  requirePermission: ((resource: string, action: string) =>
    factory.createMiddleware(async (_c, next) => {
      permissionChecks.push([resource, action]);
      await next();
    })) as WorkspaceMembersRouterDependencies["requirePermission"],
  setDottedManagers: vi.fn<WorkspaceMembersRouterDependencies["setDottedManagers"]>(),
  setManager: vi.fn<WorkspaceMembersRouterDependencies["setManager"]>(),
  setPeerSharing: vi.fn<WorkspaceMembersRouterDependencies["setPeerSharing"]>(),
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: The routes only read the workspace and actor ids from this test context.
      c.set("activeOrg", { id: "org-1" } as never);
      // SAFETY: The routes only read the actor id from the user context.
      c.set("user", { id: "actor-1" } as never);
      await next();
    })
    .route("/members", createWorkspaceMembersRouter(dependencies));
}

function putManager(userId: string, managerUserId: string | null) {
  return makeApp().request(`/members/${userId}/manager`, {
    body: JSON.stringify({ managerUserId }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
}

describe("workspace members routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissionChecks.length = 0;
    dependencies.listDirectory.mockResolvedValue([]);
    dependencies.listOptions.mockResolvedValue([]);
    dependencies.setDottedManagers.mockResolvedValue("updated");
    dependencies.setManager.mockResolvedValue("updated");
    dependencies.setPeerSharing.mockResolvedValue("updated");
  });

  it("lists every workspace member with their manager in one response", async () => {
    const response = await makeApp().request("/members");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ records: [] });
    expect(dependencies.listDirectory).toHaveBeenCalledWith("org-1");
  });

  it("keeps the complete member options endpoint for pickers", async () => {
    const response = await makeApp().request("/members/options");

    expect(response.status).toBe(200);
    expect(dependencies.listOptions).toHaveBeenCalledWith("org-1");
  });

  it("sets a manager behind member update permission and records the actor", async () => {
    const response = await putManager("user-2", "user-1");

    expect(response.status).toBe(200);
    expect(permissionChecks).toEqual([["member", "update"]]);
    expect(dependencies.setManager).toHaveBeenCalledWith({
      actorUserId: "actor-1",
      managerUserId: "user-1",
      organizationId: "org-1",
      userIds: ["user-2"],
    });
  });

  it("sets one manager for several selected members", async () => {
    const response = await makeApp().request("/members/manager", {
      body: JSON.stringify({ managerUserId: "user-1", userIds: ["user-2", "user-3"] }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(permissionChecks).toEqual([["member", "update"]]);
    expect(dependencies.setManager).toHaveBeenCalledWith({
      actorUserId: "actor-1",
      managerUserId: "user-1",
      organizationId: "org-1",
      userIds: ["user-2", "user-3"],
    });
  });

  it("clears a manager with null", async () => {
    await putManager("user-2", null);

    expect(dependencies.setManager).toHaveBeenCalledWith(
      expect.objectContaining({ managerUserId: null, userIds: ["user-2"] }),
    );
  });

  it("rejects reporting-line cycles", async () => {
    dependencies.setManager.mockResolvedValueOnce("cycle");

    const response = await putManager("user-1", "user-2");

    expect(response.status).toBe(409);
  });

  it("toggles peer sharing behind member update permission", async () => {
    const response = await makeApp().request("/members/user-2/peer-sharing", {
      body: JSON.stringify({ shareWithPeers: true }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(permissionChecks).toEqual([["member", "update"]]);
    expect(dependencies.setPeerSharing).toHaveBeenCalledWith({
      actorUserId: "actor-1",
      organizationId: "org-1",
      shareWithPeers: true,
      userId: "user-2",
    });
  });

  it("replaces dotted-line managers behind member update permission", async () => {
    const response = await makeApp().request("/members/user-2/dotted-managers", {
      body: JSON.stringify({ managerUserIds: ["user-1", "user-3"] }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(200);
    expect(permissionChecks).toEqual([["member", "update"]]);
    expect(dependencies.setDottedManagers).toHaveBeenCalledWith({
      actorUserId: "actor-1",
      managerUserIds: ["user-1", "user-3"],
      organizationId: "org-1",
      userId: "user-2",
    });
  });

  it("rejects dotted-line managers that would form a cycle", async () => {
    dependencies.setDottedManagers.mockResolvedValueOnce("cycle");

    const response = await makeApp().request("/members/user-1/dotted-managers", {
      body: JSON.stringify({ managerUserIds: ["user-2"] }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    expect(response.status).toBe(409);
  });
});
