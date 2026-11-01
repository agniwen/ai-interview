import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasWorkspacePermission } from "../workspace-permissions";
import type { WorkspacePermissionDependencies } from "../workspace-permissions";

const mocks = {
  hasPermission: vi.fn<WorkspacePermissionDependencies["hasPermission"]>(),
};

const dependencies: WorkspacePermissionDependencies = mocks;

describe("hasWorkspacePermission", () => {
  beforeEach(() => {
    mocks.hasPermission.mockReset();
  });

  it("pins every permission check to its request organization", async () => {
    mocks.hasPermission.mockImplementation((input) =>
      Promise.resolve({ success: input.body.organizationId === "org-a" }),
    );

    const headers = new Headers({ cookie: "session=test" });
    const [forA, forB] = await Promise.all([
      hasWorkspacePermission(
        {
          action: "update",
          headers,
          organizationId: "org-a",
          resource: "interview",
        },
        dependencies,
      ),
      hasWorkspacePermission(
        {
          action: "update",
          headers,
          organizationId: "org-b",
          resource: "interview",
        },
        dependencies,
      ),
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
