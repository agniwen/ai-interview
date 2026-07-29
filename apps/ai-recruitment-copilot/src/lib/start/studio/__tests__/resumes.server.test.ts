import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { loadResumeLibraryMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudioResumesData } from "../resumes.server";
import type { ResumeFilters } from "../resumes.functions";

const firstPage = {
  page: 1,
  pageSize: 20,
  records: [],
  total: 0,
  totalPages: 0,
};

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics",
  () => ({
    loadResumeLibraryMetrics: vi.fn(() => ({
      byPipeline: [],
      conversion: { withInterview: 0, withoutInterview: 0 },
      dailyAdded: [],
    })),
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes",
  () => ({
    listResumeRecords: vi.fn(() => firstPage),
  }),
);

const query: DataGridQueryState<ResumeFilters> = {
  filters: {
    creatorIds: "user-a,user-b",
    jdIds: "jd-1",
    skills: "React,TypeScript",
    stage: "screening",
    structuredMaxScore: "",
    structuredMinScore: "",
  },
  page: 3,
  pageSize: 50,
  search: "前端工程师",
  sortBy: "createdAt",
  sortOrder: "desc",
};

const visibilityScope: RecruitingVisibilityScope = {
  kind: "restricted",
  userIds: ["user-a", "user-b"],
};

describe("loadStudioResumesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates the infinite list's first page with the client query key", async () => {
    const result = await loadStudioResumesData({
      prefetchList: true,
      query,
      slug: "acme",
      visibilityScope,
      workspaceId: "org-1",
    });

    expect(loadResumeLibraryMetrics).not.toHaveBeenCalled();
    expect(listResumeRecords).toHaveBeenCalledWith(
      "org-1",
      {
        creatorIds: ["user-a", "user-b"],
        jobDescriptionIds: ["jd-1"],
        pipelineStages: ["screening"],
        search: "前端工程师",
        skills: ["React", "TypeScript"],
      },
      { page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" },
      visibilityScope,
    );
    const dehydratedState = result.dehydratedState as unknown as {
      queries: {
        queryKey: unknown[];
        state: { data: { pageParams: number[]; pages: (typeof firstPage)[] } };
      }[];
    };
    expect(dehydratedState.queries).toHaveLength(1);
    expect(dehydratedState.queries[0]?.queryKey).toEqual([
      "studio-resumes",
      "acme",
      "infinite",
      {
        filters: query.filters,
        search: "前端工程师",
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    ]);
    expect(dehydratedState.queries[0]?.state.data).toEqual({
      pageParams: [1],
      pages: [firstPage],
    });
  });

  it("skips the parent list prefetch for a nested resume detail route", async () => {
    const result = await loadStudioResumesData({
      prefetchList: false,
      query,
      slug: "acme",
      workspaceId: "org-1",
    });

    expect(loadResumeLibraryMetrics).not.toHaveBeenCalled();
    expect(listResumeRecords).not.toHaveBeenCalled();
    expect(result.dehydratedState).toMatchObject({ queries: [] });
  });
});
