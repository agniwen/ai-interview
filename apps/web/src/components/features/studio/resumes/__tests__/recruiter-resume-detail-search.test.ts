import { describe, expect, it } from "vitest";

import {
  listSearchFromDetailSearch,
  resolveResumeDetailDefaultTab,
  resumeDetailPageSearchSchema,
} from "../recruiter-resume-detail-search";

describe("recruiter resume detail search", () => {
  it("accepts list search values and resolves supported detail tabs", () => {
    const search = resumeDetailPageSearchSchema.parse({
      page: 2,
      source: ["upload", "email"],
      tab: "rounds",
    });

    expect(resolveResumeDetailDefaultTab(search)).toBe("rounds");
    expect(resolveResumeDetailDefaultTab({ tab: ["offer", "overview"] })).toBe("offer");
  });

  it("falls back to overview and removes only the detail tab when returning to the list", () => {
    expect(resolveResumeDetailDefaultTab({ tab: "unsupported" })).toBe("overview");
    expect(
      listSearchFromDetailSearch({
        page: 3,
        search: "候选人",
        tab: "human-interview",
      }),
    ).toEqual({ page: 3, search: "候选人" });
  });
});
