import { describe, expect, it } from "vitest";
import { buildResumeLibraryFiltersConfig } from "./resume-library-filters-config";

describe("recruitment atomic filters", () => {
  it("shows skill names without candidate counts", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      selectedStructuredJob: undefined,
      skillSuggestions: [{ count: 272, skill: "Docker" }],
      workspaceMembers: [],
    });
    const skills = filters.find((filter) => filter.key === "skills");
    expect(skills && "options" in skills ? skills.options : []).toEqual([
      { label: "Docker", value: "Docker" },
    ]);
  });
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
