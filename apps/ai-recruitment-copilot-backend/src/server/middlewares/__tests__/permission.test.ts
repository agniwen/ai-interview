import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";

const mocks = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy", () => ({
  createRequestWorkspaceAuthorizer: vi.fn(() => mocks.authorize),
}));

describe("requirePermission", () => {
  beforeEach(() => mocks.authorize.mockReset());

  it("fails closed when the workspace boundary was not mounted", async () => {
    const app = factory
      .createApp()
      .get("/", requirePermission("interview", "read"), (c) => c.json({ ok: true }));

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
        c.set("activeOrg", { id: "org_1" } as never);
        c.set("member", { role: "owner" } as never);
        c.set("user", { id: "user_1" } as never);
        await next();
      })
      .get("/", requirePermission("interview", "read"), (c) => c.json({ ok: true }));

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith({ action: "read", resource: "interview" });
  });
});
