import type { studioInterview } from "@arc/db-schema/schema";
import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@arc/db-schema/studio-interviews";

type LegacyCandidateStatus = typeof studioInterview.$inferInsert.status;

export interface CandidateTransitionExisting {
  closedMeta: ClosedMeta | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
}

export interface CandidateTransitionInput {
  closedMeta?: Omit<Partial<ClosedMeta>, "previousStage">;
  closedReason?: string | null;
  outcome?: CandidateOutcome;
  pipelineStage: PipelineStage;
}

export interface CandidateTransitionPatch {
  closedAt?: Date | null;
  closedReason?: string | null;
  closedMeta?: ClosedMeta | null;
  humanInterviewScheduledAt?: Date | null;
  humanInterviewerId?: string | null;
  offerAcceptedAt?: Date | null;
  offerSentAt?: Date | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  status?: LegacyCandidateStatus;
  updatedAt: Date;
  writtenTestScheduledAt?: Date | null;
  writtenTestScore?: string | null;
}

export interface CandidateTransitionAuditDetail {
  closedMeta: ClosedMeta | null;
  fromOutcome: CandidateOutcome;
  fromStage: PipelineStage;
  reason: string | null;
  toOutcome: CandidateOutcome;
  toStage: PipelineStage;
}

export function resolveCandidateTransitionPatch({
  existing,
  input,
  now,
}: {
  existing: CandidateTransitionExisting;
  input: CandidateTransitionInput;
  now: Date;
}): {
  auditDetail: CandidateTransitionAuditDetail;
  patch: CandidateTransitionPatch;
} {
  const isClosing = input.pipelineStage === "closed";
  const wasClosed = existing.pipelineStage === "closed";

  let closedAt: Date | null | undefined;
  let closedReason: string | null | undefined;
  let closedMeta: ClosedMeta | null | undefined;
  let legacyStatus: LegacyCandidateStatus | undefined;
  let humanInterviewScheduledAt: Date | null | undefined;
  let humanInterviewerId: string | null | undefined;
  let offerSentAt: Date | null | undefined;
  let offerAcceptedAt: Date | null | undefined;
  let writtenTestScheduledAt: Date | null | undefined;
  let writtenTestScore: string | null | undefined;

  if (isClosing) {
    closedAt = now;
    closedReason = input.closedReason ?? null;
    closedMeta = {
      ...existing.closedMeta,
      ...input.closedMeta,
      previousStage: existing.pipelineStage,
    };
    legacyStatus = "archived";
  } else if (wasClosed) {
    closedAt = null;
    closedReason = null;
    closedMeta = null;
    humanInterviewScheduledAt = null;
    humanInterviewerId = null;
    offerSentAt = null;
    offerAcceptedAt = null;
    writtenTestScheduledAt = null;
    writtenTestScore = null;
    legacyStatus = "ready";
  }

  const outcome = input.outcome ?? "in_pipeline";
  const patch: CandidateTransitionPatch = {
    closedAt,
    closedMeta,
    closedReason,
    humanInterviewScheduledAt,
    humanInterviewerId,
    offerAcceptedAt,
    offerSentAt,
    outcome,
    pipelineStage: input.pipelineStage,
    status: legacyStatus,
    updatedAt: now,
    writtenTestScheduledAt,
    writtenTestScore,
  };

  return {
    auditDetail: {
      closedMeta: closedMeta ?? null,
      fromOutcome: existing.outcome,
      fromStage: existing.pipelineStage,
      reason: input.closedReason ?? null,
      toOutcome: outcome,
      toStage: input.pipelineStage,
    },
    patch,
  };
}
