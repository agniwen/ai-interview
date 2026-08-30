import { describe, expect, it } from "vitest";
import { deriveOutcomeLabel } from "./labels";

describe("deriveOutcomeLabel", () => {
  it("treats hired candidates as strong positives", () => {
    expect(
      deriveOutcomeLabel({ closedMeta: null, outcome: "hired", pipelineStage: "closed" }),
    ).toEqual({ label: "positive", reason: "hired", strength: "strong" });
  });

  it.each(["written_test", "ai_interview", "human_interview", "offer"] as const)(
    "treats progression to %s as a weak positive",
    (pipelineStage) => {
      expect(
        deriveOutcomeLabel({ closedMeta: null, outcome: "in_pipeline", pipelineStage }),
      ).toEqual({ label: "positive", reason: "advanced_pipeline", strength: "weak" });
    },
  );

  it("keeps candidates rejected after advancing as weak resume-stage positives", () => {
    expect(
      deriveOutcomeLabel({
        closedMeta: { previousStage: "human_interview" },
        outcome: "rejected",
        pipelineStage: "closed",
      }),
    ).toEqual({ label: "positive", reason: "advanced_pipeline", strength: "weak" });
  });

  it("treats screening-stage skills mismatch as a strong negative", () => {
    expect(
      deriveOutcomeLabel({
        closedMeta: { category: "skills_mismatch", previousStage: "screening" },
        outcome: "rejected",
        pipelineStage: "closed",
      }),
    ).toEqual({ label: "negative", reason: "screening_skills_mismatch", strength: "strong" });
  });

  it("treats other screening-stage rejection as a weak negative", () => {
    expect(
      deriveOutcomeLabel({
        closedMeta: { category: "other", previousStage: "screening" },
        outcome: "rejected",
        pipelineStage: "closed",
      }),
    ).toEqual({ label: "negative", reason: "screening_rejected", strength: "weak" });
  });

  it.each([
    [{ closedMeta: null, outcome: "withdrawn", pipelineStage: "closed" }, "withdrawn"],
    [{ closedMeta: null, outcome: "archived", pipelineStage: "closed" }, "archived"],
    [
      {
        closedMeta: { category: "comp_disagreement", previousStage: "screening" },
        outcome: "rejected",
        pipelineStage: "closed",
      },
      "non_match_rejection",
    ],
    [{ closedMeta: null, outcome: "in_pipeline", pipelineStage: "screening" }, "not_mature"],
  ] as const)("excludes non-label outcome %#", (row, reason) => {
    expect(deriveOutcomeLabel(row)).toEqual({ excluded: reason });
  });
});
