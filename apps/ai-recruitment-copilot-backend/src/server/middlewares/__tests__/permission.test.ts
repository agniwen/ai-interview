import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type { WorkspaceAuthorizer } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import type { PermissionMiddlewareDependencies } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";

const mocks = {
  authorize: vi.fn<WorkspaceAuthorizer>(),
  createRequestWorkspaceAuthorizer:
    vi.fn<PermissionMiddlewareDependencies["createRequestWorkspaceAuthorizer"]>(),
};

const dependencies: PermissionMiddlewareDependencies = mocks;

describe("requirePermission", () => {
  beforeEach(() => {
    mocks.authorize.mockReset();
    mocks.createRequestWorkspaceAuthorizer.mockReset();
    mocks.createRequestWorkspaceAuthorizer.mockReturnValue(mocks.authorize);
  });

  it("fails closed when the workspace boundary was not mounted", async () => {
    const app = factory
      .createApp()
      .get("/", requirePermission("interview", "read", dependencies), (c) => c.json({ ok: true }));

    const response = await app.request("/");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("authorizes with one complete workspace request context", async () => {
    mocks.authorize.mockResolvedValue(true);
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("activeOrg", { id: "org_1" } as never);
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("member", { role: "owner" } as never);
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        c.set("user", { id: "user_1" } as never);
        await next();
      })
      .get("/", requirePermission("interview", "read", dependencies), (c) => c.json({ ok: true }));

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({ action: "read", resource: "interview" });
  });
});
