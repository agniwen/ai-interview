import type {
  CandidateOutcome,
  ClosedMeta,
  PipelineStage,
  ResumeEvaluationStatus,
} from "@arc/db-schema/studio-interviews";
import {
  canApplyCandidatePipelineEvent,
  getCandidatePipelineEventForTargetStage,
} from "@arc/shared/candidate-pipeline-machine";

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
  reactivationReason?: string;
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
  resumeEvaluationStatus?: ResumeEvaluationStatus | null;
  updatedAt: Date;
  writtenTestScheduledAt?: Date | null;
  writtenTestScore?: string | null;
}

export interface CandidateTransitionAuditDetail {
  closedMeta: ClosedMeta | null;
  fromOutcome: CandidateOutcome;
  fromStage: PipelineStage;
  reason: string | null;
  reactivationReason: string | null;
  toOutcome: CandidateOutcome;
  toStage: PipelineStage;
}

export interface CandidateTransitionResolution {
  auditDetail: CandidateTransitionAuditDetail;
  patch: CandidateTransitionPatch;
}

export function getCandidateReactivationError({
  from,
  reactivationReason,
  to,
}: {
  from: PipelineStage;
  reactivationReason?: string;
  to: PipelineStage;
}): string | null {
  if (from === "closed" && to !== "closed" && !reactivationReason?.trim()) {
    return "请填写重新激活原因。";
  }
  return null;
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
}): CandidateTransitionResolution {
  const isClosing = input.pipelineStage === "closed";
  const wasClosed = existing.pipelineStage === "closed";

  let closedAt: Date | null | undefined;
  let closedReason: string | null | undefined;
  let closedMeta: ClosedMeta | null | undefined;
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
    resumeEvaluationStatus: wasClosed && !isClosing ? null : undefined,
    updatedAt: now,
    writtenTestScheduledAt,
    writtenTestScore,
  };

  return {
    auditDetail: {
      closedMeta: closedMeta ?? null,
      fromOutcome: existing.outcome,
      fromStage: existing.pipelineStage,
      reactivationReason: wasClosed && !isClosing ? (input.reactivationReason ?? null) : null,
      reason: input.closedReason ?? null,
      toOutcome: outcome,
      toStage: input.pipelineStage,
    },
    patch,
  };
}
