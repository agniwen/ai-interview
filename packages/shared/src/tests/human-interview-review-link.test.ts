import { describe, expect, it } from "vitest";
import { humanInterviewReviewPath } from "../human-interview-review-link";

describe("system interview review links", () => {
  it("targets the candidate and exact round without a meeting credential", () => {
    const url = new URL(
      humanInterviewReviewPath({ candidateId: "candidate-1", roundId: "round-2", slug: "team a" }),
      "https://app.test",
    );
    expect(url.pathname).toBe("/w/team%20a/studio/resumes/candidate-1");
    expect(url.searchParams.get("tab")).toBe("human-interview");
    expect(url.searchParams.get("reviewRoundId")).toBe("round-2");
    expect(url.toString()).not.toContain("interviewer/");
  });
});
