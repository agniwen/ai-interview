import type { Env } from "../../type";
import type { SessionStateDependencies } from "./application/session-state";
import { factory } from "../../factory";
import { createSessionRouter } from "./route";
import { describe, expect, it, vi } from "vitest";

const dependencies = {
  computePermissionSnapshot: vi.fn<SessionStateDependencies["computePermissionSnapshot"]>(() =>
    Promise.resolve({ page: ["dashboard"] }),
  ),
  isNoAccessWorkspaceRole: (role) => role === "noAccess",
  listMemberships: vi.fn(() => Promise.resolve([{ organizationId: "org-1", role: "admin" }])),
  listOrganizations: vi.fn(() =>
    Promise.resolve([{ id: "org-1", logo: null, name: "Workspace", slug: "workspace" }]),
  ),
  listWaitingWorkspaces: vi.fn(() => Promise.resolve([])),
  loadLastActiveOrganizationId: vi.fn(() => Promise.resolve("org-1")),
  loadMemberRole: vi.fn(() => Promise.resolve("admin")),
  updateLastActiveOrganizationId: vi.fn(() => Promise.resolve()),
} satisfies SessionStateDependencies;

const user = {
  banExpires: null,
  banReason: null,
  banned: false,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  email: "member@example.com",
  emailVerified: true,
  id: "user-1",
  image: null,
  name: "Member",
  role: "admin",
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
} satisfies NonNullable<Env["Variables"]["user"]>;

function makeApp(currentUser: Env["Variables"]["user"]) {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("user", currentUser);
      await next();
    })
    .route("/session", createSessionRouter(dependencies));
}

describe("session state routes", () => {
  it("returns an unauthenticated state instead of an HTTP auth error", async () => {
    const response = await makeApp(null).request("/session/active-workspace");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "unauthenticated" });
  });

  it("resolves workspace access and persists the active workspace", async () => {
    const response = await makeApp(user).request("/session/workspaces/workspace/access");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      member: { role: "admin" },
      permissions: { page: ["dashboard"] },
      status: "ready",
      user: { id: "user-1" },
      workspace: { id: "org-1", slug: "workspace" },
    });
    expect(dependencies.updateLastActiveOrganizationId).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
    });
  });

  it("reports platform administrator access from the authenticated session", async () => {
    const response = await makeApp(user).request("/session/platform-admin");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });
});
