import type { CandidateOutcome, PipelineStage } from "@app/db-schema/studio-interviews";
import {
  pipelineStageSchema,
  recruitingPipelineNodeValues,
} from "@app/db-schema/studio-interviews";
import { setup, transition } from "xstate";

type Node = Exclude<PipelineStage, "closed">;
export type CandidatePipelineEvent =
  | { type: "START_AI_INTERVIEW" }
  | { type: "SKIP_TO_HUMAN_INTERVIEW" }
  | { type: "ADVANCE_TO_HUMAN_INTERVIEW" }
  | { type: "ADVANCE_TO_OFFER" }
  | { type: "ADVANCE_TO_NEXT" }
  | { outcome: Exclude<CandidateOutcome, "in_pipeline">; type: "CLOSE" }
  | { target: Node; type: "REACTIVATE" };
export type CandidatePipelineEventType = CandidatePipelineEvent["type"];
export interface CandidatePipelineSnapshot {
  stage: PipelineStage;
  currentNodePassed?: boolean;
  humanInterviewReadyForOffer?: boolean;
  closedFromNode?: Node | null;
}
interface CandidatePipelineContext {
  currentNodePassed?: boolean;
  humanInterviewReadyForOffer?: boolean;
  closedFromNode?: Node | null;
}
export interface CandidatePipelineResult {
  outcome: CandidateOutcome;
  stage: PipelineStage;
}
export function isHumanInterviewStage(
  stage: string,
): stage is "second_interview" | "final_interview" {
  return stage === "second_interview" || stage === "final_interview";
}
export function isInterviewStage(
  stage: string,
): stage is "ai_interview" | "second_interview" | "final_interview" {
  return stage === "ai_interview" || isHumanInterviewStage(stage);
}
export function isOfferStage(
  stage: string,
): stage is "income_proof" | "offer" | "background_check" {
  return stage === "income_proof" || stage === "offer" || stage === "background_check";
}
export function getCandidateActivityStatus(stage: PipelineStage): "active" | "archived" {
  return stage === "closed" ? "archived" : "active";
}

/** UI 可用动作预判；数据库事务仍核验当前有效节点、依据和版本。 */
export const candidatePipelineMachine = setup({
  guards: {
    canClose: ({ event }, params: { node: Node }) =>
      event.type === "CLOSE" && (event.outcome !== "hired" || params.node === "onboarding"),
    humanPassed: ({ context }) =>
      context.currentNodePassed === true && context.humanInterviewReadyForOffer === true,
    nodePassed: ({ context }) => context.currentNodePassed === true,
    reactivatesTo: ({ context, event }, params: { target: Node }) =>
      event.type === "REACTIVATE" &&
      event.target === params.target &&
      !!context.closedFromNode &&
      recruitingPipelineNodeValues.indexOf(params.target) <=
        recruitingPipelineNodeValues.indexOf(context.closedFromNode),
  },
  types: {
    // SAFETY: XState setup uses runtime sentinels for compile-time contract declaration.
    context: {} as CandidatePipelineContext,
    // SAFETY: XState setup uses runtime sentinels for compile-time contract declaration.
    events: {} as CandidatePipelineEvent,
  },
}).createMachine({
  context: { currentNodePassed: false },
  id: "candidatePipeline",
  initial: "screening",
  states: {
    ai_interview: {
      on: {
        ADVANCE_TO_HUMAN_INTERVIEW: { guard: "nodePassed", target: "second_interview" },
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "second_interview" },
        CLOSE: { guard: { params: { node: "ai_interview" }, type: "canClose" }, target: "closed" },
      },
    },
    background_check: {
      on: {
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "onboarding" },
        CLOSE: {
          guard: { params: { node: "background_check" }, type: "canClose" },
          target: "closed",
        },
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
            guard: { params: { target: "ai_interview" }, type: "reactivatesTo" },
            target: "ai_interview",
          },
          {
            guard: { params: { target: "second_interview" }, type: "reactivatesTo" },
            target: "second_interview",
          },
          {
            guard: { params: { target: "final_interview" }, type: "reactivatesTo" },
            target: "final_interview",
          },
          {
            guard: { params: { target: "income_proof" }, type: "reactivatesTo" },
            target: "income_proof",
          },
          { guard: { params: { target: "offer" }, type: "reactivatesTo" }, target: "offer" },
          {
            guard: { params: { target: "background_check" }, type: "reactivatesTo" },
            target: "background_check",
          },
          {
            guard: { params: { target: "onboarding" }, type: "reactivatesTo" },
            target: "onboarding",
          },
        ],
      },
    },
    final_interview: {
      on: {
        ADVANCE_TO_NEXT: { guard: "humanPassed", target: "income_proof" },
        ADVANCE_TO_OFFER: { guard: "humanPassed", target: "income_proof" },
        CLOSE: {
          guard: { params: { node: "final_interview" }, type: "canClose" },
          target: "closed",
        },
      },
    },
    income_proof: {
      on: {
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "offer" },
        CLOSE: { guard: { params: { node: "income_proof" }, type: "canClose" }, target: "closed" },
      },
    },
    offer: {
      on: {
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "background_check" },
        CLOSE: { guard: { params: { node: "offer" }, type: "canClose" }, target: "closed" },
      },
    },
    onboarding: {
      on: {
        CLOSE: { guard: { params: { node: "onboarding" }, type: "canClose" }, target: "closed" },
      },
    },
    screening: {
      on: {
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "ai_interview" },
        CLOSE: { guard: { params: { node: "screening" }, type: "canClose" }, target: "closed" },
        SKIP_TO_HUMAN_INTERVIEW: { target: "second_interview" },
        START_AI_INTERVIEW: { target: "ai_interview" },
      },
    },
    second_interview: {
      on: {
        ADVANCE_TO_NEXT: { guard: "nodePassed", target: "final_interview" },
        CLOSE: {
          guard: { params: { node: "second_interview" }, type: "canClose" },
          target: "closed",
        },
      },
    },
  },
});
function resolveCandidatePipelineSnapshot(snapshot: CandidatePipelineSnapshot) {
  return candidatePipelineMachine.resolveState({
    context: {
      closedFromNode: snapshot.closedFromNode,
      currentNodePassed: snapshot.currentNodePassed,
      humanInterviewReadyForOffer: snapshot.humanInterviewReadyForOffer,
    },
    value: snapshot.stage,
  });
}
export function getCandidatePipelineEventResult(
  snapshot: CandidatePipelineSnapshot,
  event: CandidatePipelineEvent,
): CandidatePipelineResult | null {
  const current = resolveCandidatePipelineSnapshot(snapshot);
  if (!current.can(event)) {
    return null;
  }
  const [next] = transition(candidatePipelineMachine, current, event);
  if (next.value === current.value) {
    return null;
  }
  const parsed = pipelineStageSchema.safeParse(next.value);
  return parsed.success
    ? { outcome: event.type === "CLOSE" ? event.outcome : "in_pipeline", stage: parsed.data }
    : null;
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
  if (from === "screening" && to === "ai_interview") {
    return { type: "START_AI_INTERVIEW" };
  }
  if (from === "screening" && to === "second_interview") {
    return { type: "SKIP_TO_HUMAN_INTERVIEW" };
  }
  if (recruitingPipelineNodeValues.indexOf(to) === recruitingPipelineNodeValues.indexOf(from) + 1) {
    return { type: "ADVANCE_TO_NEXT" };
  }
  return null;
}
