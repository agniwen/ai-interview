import type { studioInterview } from "@arc/db-schema/schema";
import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@arc/db-schema/studio-interviews";
import {
  canApplyCandidatePipelineEvent,
  getCandidatePipelineEventForTargetStage,
} from "@arc/shared/candidate-pipeline-machine";

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

export function getCandidateStageTransitionError({
  from,
  hasJobDescription,
  humanInterviewReadyForOffer,
  to,
}: {
  from: PipelineStage;
  hasJobDescription: boolean;
  humanInterviewReadyForOffer: boolean;
  to: PipelineStage;
}): string | null {
  if (from === to) {
    return null;
  }
  if (to === "closed") {
    return null;
  }
  if (to === "human_interview" && !hasJobDescription) {
    return "请先绑定在招岗位后再安排真人面试";
  }

  const event = getCandidatePipelineEventForTargetStage({ from, to });
  if (!event) {
    return "当前招聘阶段不能直接推进到目标阶段。";
  }
  const canApply = canApplyCandidatePipelineEvent(
    { humanInterviewReadyForOffer, stage: from },
    event,
  );
  if (canApply) {
    return null;
  }
  if (from === "human_interview" && to === "offer") {
    return "请先完成所有真人面试轮次，并补全每轮面试评价";
  }
  return "当前招聘阶段不能直接推进到目标阶段。";
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
