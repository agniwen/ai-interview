import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { Route } from "@/routes/w.$slug.studio";

type LoaderFunction<T> = T extends (...args: infer Arguments) => infer Result
  ? (...args: Arguments) => Result
  : never;
type StudioLoader = LoaderFunction<NonNullable<typeof Route.options.loader>>;

function isStudioLoader(value: typeof Route.options.loader): value is StudioLoader {
  return typeof value === "function";
}

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

async function runStudioLoader(state: WorkspaceAccessState) {
  const { loader } = Route.options;
  if (!isStudioLoader(loader)) {
    throw new TypeError("Studio route loader is unavailable.");
  }
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return await loader({
    location: { pathname: "/w/acme/studio/resumes" },
    params: { slug: "acme" },
    parentMatchPromise: Promise.resolve({ loaderData: state }),
  } as never);
}

describe("Studio route access", () => {
  it("keeps server-side data loading while rendering the Studio UI on the client", () => {
    expect(Route.options.ssr).toBe("data-only");
  });

  it("accepts the requested page from the workspace parent match", async () => {
    await expect(runStudioLoader(readyAccess(["resumes"]))).resolves.toBeNull();
  });

  it("returns not-found when the workspace parent match denies the requested page", async () => {
    await expect(runStudioLoader(readyAccess([]))).rejects.toSatisfy(isNotFound);
  });
});
