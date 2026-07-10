import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasWorkspacePermission } from "../workspace-permissions";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/auth", () => ({
  auth: { api: { hasPermission: mocks.hasPermission } },
}));

describe("hasWorkspacePermission", () => {
  beforeEach(() => {
    mocks.hasPermission.mockReset();
  });

  it("pins every permission check to its request organization", async () => {
    mocks.hasPermission.mockImplementation(({ body }) =>
      Promise.resolve({ success: body.organizationId === "org-a" }),
    );

    const headers = new Headers({ cookie: "session=test" });
    const [forA, forB] = await Promise.all([
      hasWorkspacePermission({
        action: "update",
        headers,
        organizationId: "org-a",
        resource: "interview",
      }),
      hasWorkspacePermission({
        action: "update",
        headers,
        organizationId: "org-b",
        resource: "interview",
      }),
    ]);

    expect(forA).toBe(true);
    expect(forB).toBe(false);
    expect(mocks.hasPermission).toHaveBeenNthCalledWith(1, {
      body: {
        organizationId: "org-a",
        permissions: { interview: ["update"] },
      },
      headers,
    });
    expect(mocks.hasPermission).toHaveBeenNthCalledWith(2, {
      body: {
        organizationId: "org-b",
        permissions: { interview: ["update"] },
      },
      headers,
    });
  });
});
