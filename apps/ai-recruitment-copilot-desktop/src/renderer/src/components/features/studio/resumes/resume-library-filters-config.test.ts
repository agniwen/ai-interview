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
      selectedStructuredJob: undefined,
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
      selectedStructuredJob: undefined,
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
      selectedStructuredJob: undefined,
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

  it("does not count the active stage as a resettable filter", () => {
    const filters = { ...EMPTY_RESUME_LIBRARY_FILTERS, stage: "ai_interview" };
    expect(hasActiveResumeLibraryFilters("", filters)).toBe(false);
    expect(hasActiveResumeLibraryFilters("", { ...filters, skills: "Docker" })).toBe(true);
  });
});
