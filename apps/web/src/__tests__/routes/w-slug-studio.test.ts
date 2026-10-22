import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { Route as MembersRoute } from "@/routes/w.$slug.studio.members";
import { Route } from "@/routes/w.$slug.studio";

type LoaderFunction<T> = T extends (...args: infer Arguments) => infer Result
  ? (...args: Arguments) => Result
  : never;
type RouteLoader = LoaderFunction<NonNullable<typeof Route.options.loader>>;

type StudioLoaderOption = typeof Route.options.loader | typeof MembersRoute.options.loader;

function isRouteLoader(value: StudioLoaderOption): value is RouteLoader {
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

async function runLoader(
  loader: StudioLoaderOption,
  parentLoaderData: WorkspaceAccessState,
  pathname: string,
) {
  if (!isRouteLoader(loader)) {
    throw new TypeError("Route loader is unavailable.");
  }
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return await loader({
    location: { pathname },
    params: { slug: "acme" },
    parentMatchPromise: Promise.resolve({ loaderData: parentLoaderData }),
  } as never);
}

describe("Studio route access", () => {
  it("keeps server-side data loading while rendering the Studio UI on the client", () => {
    expect(Route.options.ssr).toBe("data-only");
  });

  it("passes the workspace access state to Studio pages", async () => {
    const state = readyAccess(["members"]);
    await expect(runLoader(Route.options.loader, state, "/w/acme/studio")).resolves.toBe(state);
  });

  it("accepts a page the workspace access state allows", async () => {
    await expect(
      runLoader(MembersRoute.options.loader, readyAccess(["members"]), "/w/acme/studio/members"),
    ).resolves.toBeUndefined();
  });

  it("returns not-found for a denied page even when the layout was loaded for another page", async () => {
    // The shared layout match may be reused from an intent preload of another page,
    // so the page route must enforce its own permission.
    await expect(
      runLoader(MembersRoute.options.loader, readyAccess(["resumes"]), "/w/acme/studio/resumes"),
    ).rejects.toSatisfy(isNotFound);
  });
});
