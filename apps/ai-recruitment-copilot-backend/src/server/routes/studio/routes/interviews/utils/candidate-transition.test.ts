import { describe, expect, it } from "vitest";
import { resolveCandidateTransitionPatch } from "./candidate-transition";

const now = new Date("2026-06-21T12:00:00.000Z");

describe("resolveCandidateTransitionPatch", () => {
  it("builds a close patch with server-controlled previousStage and legacy status", () => {
    const result = resolveCandidateTransitionPatch({
      existing: {
        closedMeta: { internalNotes: "keep", previousStage: "screening" },
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
      },
      input: {
        closedMeta: { category: "skills_mismatch" },
        closedReason: "技能匹配度不够",
        outcome: "rejected",
        pipelineStage: "closed",
      },
      now,
    });

    expect(result.patch).toMatchObject({
      closedAt: now,
      closedMeta: {
        category: "skills_mismatch",
        internalNotes: "keep",
        previousStage: "ai_interview",
      },
      closedReason: "技能匹配度不够",
      outcome: "rejected",
      pipelineStage: "closed",
      status: "archived",
      updatedAt: now,
    });
    expect(result.auditDetail).toEqual({
      closedMeta: {
        category: "skills_mismatch",
        internalNotes: "keep",
        previousStage: "ai_interview",
      },
      fromOutcome: "in_pipeline",
      fromStage: "ai_interview",
      reason: "技能匹配度不够",
      toOutcome: "rejected",
      toStage: "closed",
    });
  });

  it("builds a reactivate patch that clears closed and legacy stage fields", () => {
    const result = resolveCandidateTransitionPatch({
      existing: {
        closedMeta: { previousStage: "offer" },
        outcome: "hired",
        pipelineStage: "closed",
      },
      input: {
        outcome: "in_pipeline",
        pipelineStage: "human_interview",
      },
      now,
    });

    expect(result.patch).toMatchObject({
      closedAt: null,
      closedMeta: null,
      closedReason: null,
      humanInterviewScheduledAt: null,
      humanInterviewerId: null,
      offerAcceptedAt: null,
      offerSentAt: null,
      outcome: "in_pipeline",
      pipelineStage: "human_interview",
      status: "ready",
      updatedAt: now,
      writtenTestScheduledAt: null,
      writtenTestScore: null,
    });
    expect(result.auditDetail.closedMeta).toBeNull();
    expect(result.auditDetail.fromStage).toBe("closed");
    expect(result.auditDetail.toStage).toBe("human_interview");
  });
});
