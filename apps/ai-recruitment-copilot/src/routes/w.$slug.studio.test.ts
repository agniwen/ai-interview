import { isNotFound } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { Route } from "./w.$slug.studio";

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
  if (typeof loader !== "function") {
    throw new TypeError("Studio route loader is unavailable.");
  }
  return await loader({
    location: { pathname: "/w/acme/studio/resumes" },
    params: { slug: "acme" },
    parentMatchPromise: Promise.resolve({ loaderData: state }),
  } as never);
}

describe("Studio route access", () => {
  it("accepts the requested page from the workspace parent match", async () => {
    await expect(runStudioLoader(readyAccess(["resumes"]))).resolves.toBeNull();
  });

  it("returns not-found when the workspace parent match denies the requested page", async () => {
    await expect(runStudioLoader(readyAccess([]))).rejects.toSatisfy(isNotFound);
  });
});
