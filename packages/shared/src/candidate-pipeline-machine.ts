import type { CandidateOutcome, PipelineStage } from "@arc/db-schema/studio-interviews";
import { setup, transition } from "xstate";

export type CandidatePipelineEventType =
  | "START_AI_INTERVIEW"
  | "SKIP_TO_HUMAN_INTERVIEW"
  | "ADVANCE_TO_HUMAN_INTERVIEW"
  | "ADVANCE_TO_OFFER"
  | "CLOSE"
  | "REACTIVATE";

export type CandidatePipelineEvent =
  | { type: "START_AI_INTERVIEW" }
  | { type: "SKIP_TO_HUMAN_INTERVIEW" }
  | { type: "ADVANCE_TO_HUMAN_INTERVIEW" }
  | { type: "ADVANCE_TO_OFFER" }
  | { outcome: Exclude<CandidateOutcome, "in_pipeline">; type: "CLOSE" }
  | { target: Exclude<PipelineStage, "closed">; type: "REACTIVATE" };

export interface CandidatePipelineSnapshot {
  humanInterviewReadyForOffer: boolean;
  stage: PipelineStage;
}

interface CandidatePipelineContext {
  humanInterviewReadyForOffer: boolean;
}

export interface CandidatePipelineResult {
  outcome: CandidateOutcome;
  stage: PipelineStage;
}

type ReactivationTarget = Exclude<PipelineStage, "closed">;

export const candidatePipelineMachine = setup({
  guards: {
    humanInterviewReadyForOffer: ({ context }) => context.humanInterviewReadyForOffer,
    reactivatesTo: ({ event }, params: { target: ReactivationTarget }) =>
      event.type === "REACTIVATE" && event.target === params.target,
  },
  types: {
    context: {} as CandidatePipelineContext,
    events: {} as CandidatePipelineEvent,
  },
}).createMachine({
  context: {
    humanInterviewReadyForOffer: false,
  },
  id: "candidatePipeline",
  initial: "screening",
  states: {
    ai_interview: {
      on: {
        ADVANCE_TO_HUMAN_INTERVIEW: { target: "human_interview" },
        CLOSE: { target: "closed" },
      },
    },
    closed: {
      on: {
        REACTIVATE: [
          {
            guard: { params: { target: "screening" }, type: "reactivatesTo" },
            target: "screening",
          },
          {
            guard: { params: { target: "written_test" }, type: "reactivatesTo" },
            target: "written_test",
          },
          {
            guard: { params: { target: "ai_interview" }, type: "reactivatesTo" },
            target: "ai_interview",
          },
          {
            guard: { params: { target: "human_interview" }, type: "reactivatesTo" },
            target: "human_interview",
          },
          {
            guard: { params: { target: "offer" }, type: "reactivatesTo" },
            target: "offer",
          },
        ],
      },
    },
    human_interview: {
      on: {
        ADVANCE_TO_OFFER: {
          guard: "humanInterviewReadyForOffer",
          target: "offer",
        },
        CLOSE: { target: "closed" },
      },
    },
    offer: {
      on: {
        CLOSE: { target: "closed" },
      },
    },
    screening: {
      on: {
        CLOSE: { target: "closed" },
        SKIP_TO_HUMAN_INTERVIEW: { target: "human_interview" },
        START_AI_INTERVIEW: { target: "ai_interview" },
      },
    },
    written_test: {
      on: {
        CLOSE: { target: "closed" },
        SKIP_TO_HUMAN_INTERVIEW: { target: "human_interview" },
        START_AI_INTERVIEW: { target: "ai_interview" },
      },
    },
  },
});

function resolveCandidatePipelineSnapshot(snapshot: CandidatePipelineSnapshot) {
  return candidatePipelineMachine.resolveState({
    context: {
      humanInterviewReadyForOffer: snapshot.humanInterviewReadyForOffer,
    },
    value: snapshot.stage,
  });
}

export function getCandidatePipelineEventResult(
  snapshot: CandidatePipelineSnapshot,
  event: CandidatePipelineEvent,
): CandidatePipelineResult | null {
  const currentSnapshot = resolveCandidatePipelineSnapshot(snapshot);
  if (!currentSnapshot.can(event)) {
    return null;
  }

  const [nextSnapshot] = transition(candidatePipelineMachine, currentSnapshot, event);

  if (nextSnapshot.value === currentSnapshot.value) {
    return null;
  }

  return {
    outcome: event.type === "CLOSE" ? event.outcome : "in_pipeline",
    stage: nextSnapshot.value as PipelineStage,
  };
}

export function canApplyCandidatePipelineEvent(
  snapshot: CandidatePipelineSnapshot,
  event: CandidatePipelineEvent,
): boolean {
  return resolveCandidatePipelineSnapshot(snapshot).can(event);
}

export function getCandidatePipelineEventForTargetStage({
  from,
  to,
}: {
  from: PipelineStage;
  to: PipelineStage;
}): CandidatePipelineEvent | null {
  if (to === "closed") {
    return null;
  }
  if (from === "closed") {
    return { target: to, type: "REACTIVATE" };
  }
  if (from === "screening" || from === "written_test") {
    if (to === "ai_interview") {
      return { type: "START_AI_INTERVIEW" };
    }
    if (to === "human_interview") {
      return { type: "SKIP_TO_HUMAN_INTERVIEW" };
    }
    return null;
  }
  if (from === "ai_interview" && to === "human_interview") {
    return { type: "ADVANCE_TO_HUMAN_INTERVIEW" };
  }
  if (from === "human_interview" && to === "offer") {
    return { type: "ADVANCE_TO_OFFER" };
  }
  return null;
}
