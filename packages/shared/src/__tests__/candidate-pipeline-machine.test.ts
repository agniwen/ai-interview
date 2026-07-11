import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import {
  canApplyCandidatePipelineEvent,
  candidatePipelineMachine,
  getCandidateActivityStatus,
  getCandidatePipelineEventResult,
} from "@arc/shared/candidate-pipeline-machine";

describe("candidate pipeline machine", () => {
  it("derives semantic activity only from the terminal pipeline stage", () => {
    expect(getCandidateActivityStatus("screening")).toBe("active");
    expect(getCandidateActivityStatus("offer")).toBe("active");
    expect(getCandidateActivityStatus("closed")).toBe("archived");
  });

  it("allows screening to start AI, skip to human interview, or close, but not offer", () => {
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: "screening" },
        { type: "START_AI_INTERVIEW" },
      ),
    ).toBe(true);
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: "screening" },
        { type: "SKIP_TO_HUMAN_INTERVIEW" },
      ),
    ).toBe(true);
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: "screening" },
        { outcome: "rejected", type: "CLOSE" },
      ),
    ).toBe(true);
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: "screening" },
        { type: "ADVANCE_TO_OFFER" },
      ),
    ).toBe(false);
  });

  it("requires human interview readiness before advancing to offer", () => {
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: false, stage: "human_interview" },
        { type: "ADVANCE_TO_OFFER" },
      ),
    ).toBe(false);
    expect(
      canApplyCandidatePipelineEvent(
        { humanInterviewReadyForOffer: true, stage: "human_interview" },
        { type: "ADVANCE_TO_OFFER" },
      ),
    ).toBe(true);
  });

  it("maps allowed events to the next stage and outcome", () => {
    expect(
      getCandidatePipelineEventResult(
        { humanInterviewReadyForOffer: false, stage: "screening" },
        { type: "START_AI_INTERVIEW" },
      ),
    ).toEqual({ outcome: "in_pipeline", stage: "ai_interview" });
    expect(
      getCandidatePipelineEventResult(
        { humanInterviewReadyForOffer: false, stage: "ai_interview" },
        { type: "ADVANCE_TO_HUMAN_INTERVIEW" },
      ),
    ).toEqual({ outcome: "in_pipeline", stage: "human_interview" });
    expect(
      getCandidatePipelineEventResult(
        { humanInterviewReadyForOffer: true, stage: "human_interview" },
        { type: "ADVANCE_TO_OFFER" },
      ),
    ).toEqual({ outcome: "in_pipeline", stage: "offer" });
    expect(
      getCandidatePipelineEventResult(
        { humanInterviewReadyForOffer: true, stage: "offer" },
        { outcome: "hired", type: "CLOSE" },
      ),
    ).toEqual({ outcome: "hired", stage: "closed" });
  });

  it("exposes the recruiting flow as an XState machine", () => {
    const actor = createActor(candidatePipelineMachine, {
      snapshot: candidatePipelineMachine.resolveState({
        context: { humanInterviewReadyForOffer: false },
        value: "screening",
      }),
    });
    actor.start();

    actor.send({ type: "ADVANCE_TO_OFFER" });
    expect(actor.getSnapshot().value).toBe("screening");

    actor.send({ type: "SKIP_TO_HUMAN_INTERVIEW" });
    expect(actor.getSnapshot().value).toBe("human_interview");

    actor.send({ type: "ADVANCE_TO_OFFER" });
    expect(actor.getSnapshot().value).toBe("human_interview");
  });

  it("uses the current XState pure transition API", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../candidate-pipeline-machine.ts", import.meta.url)),
      "utf-8",
    );

    expect(source).toContain("transition(");
    expect(source).not.toContain("getNextSnapshot");
    expect(source).not.toContain("getInitialSnapshot");
  });

  it("uses XState snapshots directly for event availability", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../candidate-pipeline-machine.ts", import.meta.url)),
      "utf-8",
    );

    expect(source).toContain(".can(event)");
    expect(source).not.toContain("candidatePipelineEventProbes");
    expect(source).not.toContain("getCandidatePipelineEvents");
  });
});
