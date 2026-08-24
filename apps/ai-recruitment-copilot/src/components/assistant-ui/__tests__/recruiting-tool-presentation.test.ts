import { describe, expect, it } from "vitest";
import { shouldPresentResumeReviewCard } from "../recruiting-tool-presentation";

describe("shouldPresentResumeReviewCard", () => {
  it("keeps unbound candidate reads out of the transcript", () => {
    expect(shouldPresentResumeReviewCard()).toBe(false);
    expect(shouldPresentResumeReviewCard({ jobDescriptionId: null })).toBe(false);
  });

  it("proactively shows the review card for a job-bound candidate", () => {
    expect(shouldPresentResumeReviewCard({ jobDescriptionId: "job-1" })).toBe(true);
  });
});
