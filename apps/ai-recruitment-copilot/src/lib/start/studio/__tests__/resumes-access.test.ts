import { describe, expect, it } from "vitest";
import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { canReadStudioResumes } from "../resumes-access";

function readyAccess(
  permissions: Extract<WorkspaceAccessState, { status: "ready" }>["permissions"],
): Extract<WorkspaceAccessState, { status: "ready" }> {
  return {
    member: { role: "member" },
    permissions,
    status: "ready",
    user: { id: "user-1" },
    workspace: { id: "org-1", slug: "acme" },
  };
}

describe("canReadStudioResumes", () => {
  it("requires both the Studio page and resume-library resource permissions", () => {
    expect(
      canReadStudioResumes(
        readyAccess({
          page: ["resumes"],
          resumeLibrary: ["read"],
        }),
      ),
    ).toBe(true);

    expect(
      canReadStudioResumes(
        readyAccess({
          page: [],
          resumeLibrary: ["read"],
        }),
      ),
    ).toBe(false);

    expect(
      canReadStudioResumes(
        readyAccess({
          page: ["resumes"],
          resumeLibrary: [],
        }),
      ),
    ).toBe(false);
  });
});
