import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@app/db-schema/studio-interviews";
import type { LabelExclusionReason, LabelReason, LabelStrength, OutcomeLabel } from "./types";

interface OutcomeFields {
  closedMeta: ClosedMeta | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
}

export type DerivedOutcomeLabel =
  | {
      label: OutcomeLabel;
      reason: LabelReason;
      strength: LabelStrength;
    }
  | { excluded: LabelExclusionReason };

const ADVANCED_STAGES = new Set<PipelineStage>([
  "final_interview",
  "ai_interview",
  "second_interview",
  "offer",
]);

const NON_MATCH_REJECTION_CATEGORIES = new Set([
  "candidate_withdrew",
  "comp_disagreement",
  "position_filled",
]);

export function deriveOutcomeLabel(row: OutcomeFields): DerivedOutcomeLabel {
  if (row.outcome === "hired") {
    return { label: "positive", reason: "hired", strength: "strong" };
  }
  if (row.outcome === "withdrawn" || row.outcome === "archived") {
    return { excluded: row.outcome };
  }

  const effectiveStage =
    row.outcome === "rejected" ? row.closedMeta?.previousStage : row.pipelineStage;
  if (effectiveStage && ADVANCED_STAGES.has(effectiveStage)) {
    return { label: "positive", reason: "advanced_pipeline", strength: "weak" };
  }

  if (row.outcome === "rejected") {
    if (!effectiveStage) {
      return { excluded: "missing_previous_stage" };
    }
    const category = row.closedMeta?.category;
    if (category && NON_MATCH_REJECTION_CATEGORIES.has(category)) {
      return { excluded: "non_match_rejection" };
    }
    if (category === "skills_mismatch") {
      return {
        label: "negative",
        reason: "screening_skills_mismatch",
        strength: "strong",
      };
    }
    return { label: "negative", reason: "screening_rejected", strength: "weak" };
  }

  return { excluded: "not_mature" };
}
