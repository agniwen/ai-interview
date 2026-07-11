import { describe, expect, expectTypeOf, it } from "vitest";
import type { AiRunEvent, AiRunEventType } from "../ai-run-events";
import { isAiRunTerminalEvent } from "../ai-run-events";

describe("AiRunEvent", () => {
  it("accepts step and approval events used by Mastra workflow UI", () => {
    const events: AiRunEvent[] = [
      { runId: "run-1", title: "分析简历", type: "run.started", workflowId: "resume-analysis" },
      { label: "读取简历", runId: "run-1", stepId: "load", type: "step.started" },
      {
        payload: { action: "applyJobDescription" },
        runId: "run-1",
        toolCallId: "tool-1",
        type: "approval.required",
      },
    ];

    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "step.started",
      "approval.required",
    ]);
  });

  it("detects terminal run events", () => {
    expect(
      isAiRunTerminalEvent({ output: { ok: true }, runId: "run-1", type: "run.completed" }),
    ).toBe(true);
    expect(
      isAiRunTerminalEvent({
        error: { message: "failed" },
        runId: "run-1",
        type: "run.failed",
      }),
    ).toBe(true);
    expect(
      isAiRunTerminalEvent({
        at: "2026-01-01T00:00:00.000Z",
        runId: "run-1",
        type: "run.heartbeat",
      }),
    ).toBe(false);
  });

  it("exposes a stable event type union", () => {
    expectTypeOf<AiRunEventType>().toEqualTypeOf<
      | "approval.required"
      | "artifact.created"
      | "run.completed"
      | "run.failed"
      | "run.heartbeat"
      | "run.resumed"
      | "run.started"
      | "run.suspended"
      | "scorer.completed"
      | "step.completed"
      | "step.delta"
      | "step.preview"
      | "step.progress"
      | "step.started"
      | "tool.completed"
      | "tool.started"
    >();
  });
});
