import { describe, expect, it } from "vitest";
import { buildResumeLibraryFiltersConfig } from "../resume-library-filters-config";

describe("recruitment skill filters", () => {
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
