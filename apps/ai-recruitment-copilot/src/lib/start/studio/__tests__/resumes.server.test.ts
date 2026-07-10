import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { loadResumeLibraryMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudioResumesData } from "../resumes.server";

vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  resolveRecruitingVisibilityScope: vi.fn(() => ({ kind: "all" })),
}));

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
    listResumeRecords: vi.fn(() => ({
      page: 1,
      pageSize: 20,
      records: [],
      total: 0,
      totalPages: 0,
    })),
  }),
);

describe("loadStudioResumesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only SSR metrics and leaves the infinite list to the client", async () => {
    const result = await loadStudioResumesData({
      workspaceId: "org-1",
    });

    expect(loadResumeLibraryMetrics).toHaveBeenCalledWith("org-1");
    expect(resolveRecruitingVisibilityScope).not.toHaveBeenCalled();
    expect(listResumeRecords).not.toHaveBeenCalled();
    expect(result).toEqual({
      metrics: {
        byPipeline: [],
        conversion: { withInterview: 0, withoutInterview: 0 },
        dailyAdded: [],
      },
    });
  });
});
