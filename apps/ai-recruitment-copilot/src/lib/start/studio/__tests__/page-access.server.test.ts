import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAuthorizedStudioPageAccessFromRequest } from "../page-access.server";

const mocks = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
}));

vi.mock("@/lib/start/auth-session.server", () => ({
  resolveWorkspaceAccessFromRequest: mocks.resolveAccess,
}));

function readyAccess(
  page: Extract<WorkspaceAccessState, { status: "ready" }>["permissions"]["page"],
): Extract<WorkspaceAccessState, { status: "ready" }> {
  return {
    member: { role: "member" },
    permissions: { page },
    status: "ready",
    user: { id: "user-1" },
    workspace: { id: "org-1", slug: "acme" },
  };
}

describe("resolveAuthorizedStudioPageAccessFromRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the workspace access snapshot when the page is allowed", async () => {
    const access = readyAccess(["dashboard"]);
    mocks.resolveAccess.mockResolvedValue(access);

    await expect(resolveAuthorizedStudioPageAccessFromRequest("acme", "dashboard")).resolves.toBe(
      access,
    );
  });

  it("hides the page when the workspace member lacks its page permission", async () => {
    mocks.resolveAccess.mockResolvedValue(readyAccess([]));

    await expect(
      resolveAuthorizedStudioPageAccessFromRequest("acme", "dashboard"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it.each([{ status: "unauthenticated" }, { status: "not_found" }] as const)(
    "preserves the $status workspace state",
    async (access) => {
      mocks.resolveAccess.mockResolvedValue(access);

      await expect(
        resolveAuthorizedStudioPageAccessFromRequest("acme", "dashboard"),
      ).resolves.toEqual(access);
    },
  );
});
