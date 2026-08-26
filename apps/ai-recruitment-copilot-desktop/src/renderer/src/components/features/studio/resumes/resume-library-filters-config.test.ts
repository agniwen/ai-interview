import { describe, expect, it } from "vitest";
import { buildResumeLibraryFiltersConfig } from "./resume-library-filters-config";

describe("recruitment atomic filters", () => {
  it("keeps all visible pipeline stages in Filters after removing the stage tabs", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      selectedStructuredJob: undefined,
      skillSuggestions: [],
      workspaceMembers: [],
    });
    expect(filters).toContainEqual({
      key: "textFilters",
      resource: "resumes",
      type: "text-filters",
    });
    expect(filters.find((filter) => filter.key === "stage")).toMatchObject({
      label: "招聘阶段",
      options: [
        { label: "简历筛选", value: "screening" },
        { label: "AI 面试", value: "ai_interview" },
        { label: "真人复面", value: "human_interview" },
        { label: "Offer", value: "offer" },
        { label: "已结案", value: "closed" },
      ],
      type: "select",
    });
  });
});
