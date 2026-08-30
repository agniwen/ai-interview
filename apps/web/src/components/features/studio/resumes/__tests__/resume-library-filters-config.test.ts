import { describe, expect, it } from "vitest";
import { buildResumeLibraryFiltersConfig } from "../resume-library-filters-config";

describe("recruitment skill filters", () => {
  it("provides creation time as a date-range editor", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [],
      workspaceMembers: [],
    });
    const createdAt = filters.find((filter) => filter.key === "createdAtRange");
    expect(createdAt).toMatchObject({
      label: "创建时间",
      operator: { label: "在", value: "is" },
      type: "custom",
    });
    expect(createdAt?.type === "custom" && createdAt.formatValue?.("")).toBe("创建时间");
  });
  it("keeps pipeline stages out of the configurable filters", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [],
      workspaceMembers: [],
    });
    expect(filters.some((filter) => filter.key === "stage")).toBe(false);
  });

  it("shows skill names without candidate counts", () => {
    const filters = buildResumeLibraryFiltersConfig({
      jobDescriptions: [],
      skillSuggestions: [{ count: 272, skill: "Docker" }],
      workspaceMembers: [],
    });
    const skills = filters.find((filter) => filter.key === "skills");
    expect(skills).toMatchObject({ match: "all", type: "multi-select" });
    expect(skills && "options" in skills ? skills.options : []).toEqual([
      { label: "Docker", value: "Docker" },
    ]);
  });
});
