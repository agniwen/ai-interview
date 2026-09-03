import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceAccessState: vi.fn(),
}));

describe("workspace route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the requested workspace page in the login callback", async () => {
    vi.stubGlobal("__ARC_BUILD_TIME__", "2026-08-01T00:00:00.000Z");
    const { loadWorkspaceRoute } = await import("@/routes/w.$slug");
    mocks.getWorkspaceAccessState.mockResolvedValue({ status: "unauthenticated" });
    try {
      await loadWorkspaceRoute(
        {
          location: {
            href: "/w/acme/studio/resumes/record-1?tab=offer",
            pathname: "/w/acme/studio/resumes/record-1",
          },
          params: { slug: "acme" },
        },
        { getWorkspaceAccessState: mocks.getWorkspaceAccessState },
      );
      throw new Error("Expected the workspace loader to redirect.");
    } catch (error) {
      expect(isRedirect(error)).toBe(true);
      expect(error).toMatchObject({
        options: {
          href: "/login?callbackURL=%2Fw%2Facme%2Fstudio%2Fresumes%2Frecord-1%3Ftab%3Doffer",
        },
      });
    }
  });
});
