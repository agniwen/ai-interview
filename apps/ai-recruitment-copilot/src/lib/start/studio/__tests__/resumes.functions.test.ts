import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeFilters } from "../resumes.functions";
import { loadStudioResumesStateFromRequest } from "../resumes-state.server";

const mocks = vi.hoisted(() => ({
  loadData: vi.fn(),
  resolveAccess: vi.fn(),
  resolveVisibility: vi.fn(),
}));

vi.mock("@/lib/start/auth-session.server", () => ({
  resolveWorkspaceAccessFromRequest: mocks.resolveAccess,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: mocks.resolveVisibility,
}));

vi.mock("../resumes.server", () => ({
  loadStudioResumesData: mocks.loadData,
}));

const query: DataGridQueryState<ResumeFilters> = {
  filters: {
    creatorIds: "",
    jdIds: "",
    skills: "",
    stage: "",
  },
  page: 1,
  pageSize: 20,
  search: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

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
    mocks.resolveVisibility.mockResolvedValue({ kind: "all" });
    mocks.loadData.mockResolvedValue({
      dehydratedState: { mutations: [], queries: [] },
    });
  });

  it("loads the list only when page and resource permissions are both allowed", async () => {
    mocks.resolveAccess.mockResolvedValue(
      readyAccess({
        page: ["resumes"],
        resumeLibrary: ["read"],
      }),
    );

    await expect(
      loadStudioResumesStateFromRequest({
        prefetchList: true,
        query,
        slug: "acme",
      }),
    ).resolves.toEqual({
      dehydratedState: { mutations: [], queries: [] },
      mode: "list",
      status: "ready",
    });
    expect(mocks.loadData).toHaveBeenCalledOnce();
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
        prefetchList: true,
        query,
        slug: "acme",
      }),
    ).resolves.toEqual({ status: "not_found" });
    expect(mocks.loadData).not.toHaveBeenCalled();
  });

  it.each([{ status: "unauthenticated" }, { status: "not_found" }] as const)(
    "preserves the $status access state without loading data",
    async (accessState) => {
      mocks.resolveAccess.mockResolvedValue(accessState);

      await expect(
        loadStudioResumesStateFromRequest({
          prefetchList: true,
          query,
          slug: "acme",
        }),
      ).resolves.toEqual(accessState);
      expect(mocks.loadData).not.toHaveBeenCalled();
    },
  );

  it("returns a nested state without creating list hydration data", async () => {
    mocks.resolveAccess.mockResolvedValue(
      readyAccess({
        page: ["resumes"],
        resumeLibrary: ["read"],
      }),
    );

    await expect(
      loadStudioResumesStateFromRequest({
        prefetchList: false,
        query,
        slug: "acme",
      }),
    ).resolves.toEqual({ mode: "nested", status: "ready" });
    expect(mocks.resolveVisibility).not.toHaveBeenCalled();
    expect(mocks.loadData).not.toHaveBeenCalled();
  });
});
