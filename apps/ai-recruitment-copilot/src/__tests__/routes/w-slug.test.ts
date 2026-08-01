import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/w.$slug";

const mocks = vi.hoisted(() => ({
  getWorkspaceAccessState: vi.fn(),
}));

vi.mock("@/lib/start/auth-session", () => ({
  getWorkspaceAccessState: mocks.getWorkspaceAccessState,
}));

vi.mock("@/lib/client/build-info", () => ({
  BUILD_TIME: "2026-08-01T00:00:00.000Z",
}));

describe("workspace route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the requested workspace page in the login callback", async () => {
    mocks.getWorkspaceAccessState.mockResolvedValue({ status: "unauthenticated" });
    const { loader } = Route.options;
    if (typeof loader !== "function") {
      throw new TypeError("Workspace route loader is unavailable.");
    }

    try {
      await loader({
        location: {
          href: "/w/acme/studio/resumes/record-1?tab=offer",
          pathname: "/w/acme/studio/resumes/record-1",
        },
        params: { slug: "acme" },
      } as never);
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
