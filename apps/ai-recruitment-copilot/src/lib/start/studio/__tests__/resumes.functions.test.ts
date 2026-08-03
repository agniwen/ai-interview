import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudioResumesStateFromRequest } from "../resumes-state.server";

const mocks = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
}));

vi.mock("@/lib/start/auth-session.server", () => ({
  resolveWorkspaceAccessFromRequest: mocks.resolveAccess,
}));

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

describe("loadStudioResumesStateFromRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ready without loading list data when page and resource permissions are allowed", async () => {
    mocks.resolveAccess.mockResolvedValue(
      readyAccess({
        page: ["resumes"],
        resumeLibrary: ["read"],
      }),
    );

    await expect(
      loadStudioResumesStateFromRequest({
        slug: "acme",
      }),
    ).resolves.toEqual({ status: "ready" });
  });

  it.each([
    {
      label: "page permission is denied",
      permissions: { page: [], resumeLibrary: ["read"] },
    },
    {
      label: "resource permission is denied",
      permissions: { page: ["resumes"], resumeLibrary: [] },
    },
  ] satisfies {
    label: string;
    permissions: Extract<WorkspaceAccessState, { status: "ready" }>["permissions"];
  }[])("does not load data when $label", async ({ permissions }) => {
    mocks.resolveAccess.mockResolvedValue(readyAccess(permissions));

    await expect(
      loadStudioResumesStateFromRequest({
        slug: "acme",
      }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it.each([{ status: "unauthenticated" }, { status: "not_found" }] as const)(
    "preserves the $status access state without loading data",
    async (accessState) => {
      mocks.resolveAccess.mockResolvedValue(accessState);

      await expect(
        loadStudioResumesStateFromRequest({
          slug: "acme",
        }),
      ).resolves.toEqual(accessState);
    },
  );
});
