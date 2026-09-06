import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import {
  candidatePipelineMachine,
  getCandidatePipelineEventResult,
  canApplyCandidatePipelineEvent,
  isHumanInterviewStage,
  isOfferStage,
} from "../candidate-pipeline-machine";

describe("招聘具体节点状态机", () => {
  it("快捷进入真人仅进入复试", () => {
    expect(
      getCandidatePipelineEventResult({ stage: "screening" }, { type: "SKIP_TO_HUMAN_INTERVIEW" }),
    ).toEqual({ outcome: "in_pipeline", stage: "second_interview" });
  });
  it("逐节点推进需要当前通过，终试还需要有效两轮通过", () => {
    expect(
      canApplyCandidatePipelineEvent({ stage: "second_interview" }, { type: "ADVANCE_TO_NEXT" }),
    ).toBe(false);
    expect(
      getCandidatePipelineEventResult(
        { currentNodePassed: true, stage: "second_interview" },
        { type: "ADVANCE_TO_NEXT" },
      )?.stage,
    ).toBe("final_interview");
    expect(
      canApplyCandidatePipelineEvent(
        { currentNodePassed: true, stage: "final_interview" },
        { type: "ADVANCE_TO_NEXT" },
      ),
    ).toBe(false);
    expect(
      getCandidatePipelineEventResult(
        { currentNodePassed: true, humanInterviewReadyForOffer: true, stage: "final_interview" },
        { type: "ADVANCE_TO_NEXT" },
      )?.stage,
    ).toBe("income_proof");
  });
  it("接受Offer后是背调，不能直接标记已入职", () => {
    expect(
      getCandidatePipelineEventResult(
        { currentNodePassed: true, stage: "offer" },
        { type: "ADVANCE_TO_NEXT" },
      )?.stage,
    ).toBe("background_check");
    expect(
      canApplyCandidatePipelineEvent({ stage: "offer" }, { outcome: "hired", type: "CLOSE" }),
    ).toBe(false);
    expect(
      canApplyCandidatePipelineEvent({ stage: "onboarding" }, { outcome: "hired", type: "CLOSE" }),
    ).toBe(true);
  });
  it("回开只能到达结束前已到达的节点", () => {
    expect(
      canApplyCandidatePipelineEvent(
        { closedFromNode: "second_interview", stage: "closed" },
        { target: "ai_interview", type: "REACTIVATE" },
      ),
    ).toBe(true);
    expect(
      canApplyCandidatePipelineEvent(
        { closedFromNode: "second_interview", stage: "closed" },
        { target: "onboarding", type: "REACTIVATE" },
      ),
    ).toBe(false);
  });
  it("实际XState actor遵循相同推进规则", () => {
    const actor = createActor(candidatePipelineMachine);
    actor.start();
    actor.send({ type: "ADVANCE_TO_NEXT" });
    expect(actor.getSnapshot().value).toBe("screening");
    actor.send({ type: "SKIP_TO_HUMAN_INTERVIEW" });
    expect(actor.getSnapshot().value).toBe("second_interview");
    actor.stop();
  });
  it("阶段分组不混入入职和旧节点", () => {
    expect(isHumanInterviewStage("final_interview")).toBe(true);
    expect(isHumanInterviewStage("human_interview")).toBe(false);
    expect(isOfferStage("income_proof")).toBe(true);
    expect(isOfferStage("onboarding")).toBe(false);
  });
});
