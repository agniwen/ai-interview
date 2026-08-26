import { describe, expect, it } from "vitest";
import { buildResumeLibraryFiltersConfig } from "./resume-library-filters-config";
import {
  EMPTY_RESUME_LIBRARY_FILTERS,
  hasActiveResumeLibraryFilters,
} from "./resume-library-filter-model";

describe("recruitment atomic filters", () => {
  it("provides creation time as a resettable date-range filter", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [],
      workspaceMembers: [],
    });
    expect(filters.find((filter) => filter.key === "createdAtRange")).toMatchObject({
      label: "创建时间",
      type: "custom",
    });
    expect(
      hasActiveResumeLibraryFilters("", {
        ...EMPTY_RESUME_LIBRARY_FILTERS,
        createdAtRange: "custom:2026-08-26:2026-08-26",
      }),
    ).toBe(true);
  });
  it("shows skill names without candidate counts", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [{ count: 272, skill: "Docker" }],
      workspaceMembers: [],
    });
    const skills = filters.find((filter) => filter.key === "skills");
    expect(skills && "options" in skills ? skills.options : []).toEqual([
      { label: "Docker", value: "Docker" },
    ]);
  });
  it("keeps pipeline stages out of the configurable filters", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [],
      workspaceMembers: [],
    });
    expect(filters).toContainEqual({
      key: "textFilters",
      resource: "resumes",
      type: "text-filters",
    });
    expect(filters.some((filter) => filter.key === "stage")).toBe(false);
  });

  it("offers the four advisory levels without numeric score filters", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [
        { departmentName: null, evaluationMode: "structured", id: "job-1", name: "工程师" },
      ],
      skillSuggestions: [],
      workspaceMembers: [],
    });
    const recommendation = filters.find((filter) => filter.key === "recommendationLevels");
    expect(recommendation && "options" in recommendation ? recommendation.options : []).toEqual([
      { label: "非常推荐", value: "highly_recommended" },
      { label: "推荐", value: "recommended" },
      { label: "待定", value: "undecided" },
      { label: "不推荐", value: "not_recommended" },
    ]);
    expect(
      filters.some(
        (filter) => filter.key === "structuredMinScore" || filter.key === "structuredMaxScore",
      ),
    ).toBe(false);
    expect(
      hasActiveResumeLibraryFilters("", {
        ...EMPTY_RESUME_LIBRARY_FILTERS,
        recommendationLevels: "recommended",
      }),
    ).toBe(true);
  });

  it("does not count the active stage as a resettable filter", () => {
    const filters = { ...EMPTY_RESUME_LIBRARY_FILTERS, stage: "ai_interview" };
    expect(hasActiveResumeLibraryFilters("", filters)).toBe(false);
    expect(hasActiveResumeLibraryFilters("", { ...filters, skills: "Docker" })).toBe(true);
  });
});
