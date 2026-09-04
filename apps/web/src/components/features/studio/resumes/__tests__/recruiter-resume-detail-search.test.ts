import { describe, expect, it } from "vitest";

import {
  buildResumeDetailTabSearch,
  listSearchFromDetailSearch,
  resolveResumeDetailDefaultTab,
  resumeDetailPageSearchSchema,
  resolveHumanInterviewReviewRoundId,
  withoutHumanInterviewReviewSearch,
} from "../recruiter-resume-detail-search";

describe("recruiter resume detail search", () => {
  it("persists tab changes while preserving list state and closing review state", () => {
    const roundId = "00000000-0000-4000-8000-000000000002";

    expect(
      buildResumeDetailTabSearch(
        { page: 3, reviewRoundId: roundId, search: "候选人", tab: "human-interview" },
        "offer",
      ),
    ).toEqual({ page: 3, search: "候选人", tab: "offer" });
    expect(buildResumeDetailTabSearch({ page: 3, tab: "rounds" }, "overview")).toEqual({
      page: 3,
      tab: "overview",
    });
  });

  it("opens a valid review round on the human interview tab and clears only its modal state", () => {
    const roundId = "00000000-0000-4000-8000-000000000002";
    const search = { page: 3, reviewRoundId: roundId, tab: "human-interview" };
    expect(resolveHumanInterviewReviewRoundId(search)).toBe(roundId);
    expect(resolveResumeDetailDefaultTab({ ...search, tab: "overview" })).toBe("human-interview");
    expect(withoutHumanInterviewReviewSearch(search)).toEqual({ page: 3, tab: "human-interview" });
    expect(listSearchFromDetailSearch(search)).toEqual({ page: 3 });
    expect(resolveHumanInterviewReviewRoundId({ reviewRoundId: [roundId] })).toBeNull();
    expect(resolveHumanInterviewReviewRoundId({ reviewRoundId: "bad-round" })).toBeNull();
  });
  it("accepts list search values and resolves supported detail tabs", () => {
    const search = resumeDetailPageSearchSchema.parse({
      page: 2,
      source: ["upload", "email"],
      tab: "rounds",
    });

    expect(resolveResumeDetailDefaultTab(search)).toBe("rounds");
    expect(resolveResumeDetailDefaultTab({ tab: "ai-analysis" })).toBe("ai-analysis");
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
