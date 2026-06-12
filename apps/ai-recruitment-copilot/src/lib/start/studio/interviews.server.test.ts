import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudioInterviewsHydrationState } from "./interviews.server";
import type { InterviewFilters } from "./interviews.functions";
import {
  listInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds",
  () => ({
    listInterviewRounds: vi.fn(() => ({
      page: 1,
      pageSize: 20,
      records: [],
      total: 0,
      totalPages: 0,
    })),
    summarizeInterviewRoundCounts: vi.fn(() => ({
      completed: 0,
      inProgress: 0,
      interrupted: 0,
      pending: 0,
      total: 0,
    })),
  }),
);

const query: DataGridQueryState<InterviewFilters> = {
  filters: { creatorIds: "", status: "" },
  page: 1,
  pageSize: 20,
  search: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

describe("loadStudioInterviewsHydrationState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes recruiting visibility scope to hydrated list and summary queries", async () => {
    const visibilityScope: RecruitingVisibilityScope = {
      kind: "restricted",
      userIds: ["user-a", "user-b"],
    };

    await loadStudioInterviewsHydrationState({
      query,
      slug: "default",
      visibilityScope,
      workspaceId: "org-1",
    });

    expect(listInterviewRounds).toHaveBeenCalledWith(
      "org-1",
      { creatorIds: [], search: "", status: "" },
      { page: 1, pageSize: 20, sortBy: "createdAt", sortOrder: "desc" },
      visibilityScope,
    );
    expect(summarizeInterviewRoundCounts).toHaveBeenCalledWith("org-1", visibilityScope);
  });
});
