import { describe, expect, it } from "vitest";
import { buildStreamErrorMessage, isMaxStepsFinishChunk } from "../stream-error-message";

describe("stream error messages", () => {
  it("only treats terminal tool-call finish chunks as maxSteps exhaustion", () => {
    expect(
      isMaxStepsFinishChunk({
        payload: {
          stepResult: {
            reason: "tool-calls",
          },
        },
        type: "finish",
      }),
    ).toBe(true);

    expect(
      isMaxStepsFinishChunk({
        payload: {
          stepResult: {
            reason: "tool-calls",
          },
        },
        type: "step-finish",
      }),
    ).toBe(false);

    expect(
      isMaxStepsFinishChunk({
        payload: {
          stepResult: {
            reason: "stop",
          },
        },
        type: "finish",
      }),
    ).toBe(false);
  });

  it("preserves human-readable error payloads", () => {
    expect(
      buildStreamErrorMessage({
        payload: { error: new Error("Readable failure") },
        runId: "run-1",
      }).content.parts,
    ).toEqual([{ text: "Readable failure", type: "text" }]);
  });

  it("falls back safely for missing and unserializable error payloads", () => {
    expect(buildStreamErrorMessage({ runId: "run-1" }).content.parts).toEqual([
      { text: "Unknown error", type: "text" },
    ]);

    const circularError: Record<string, unknown> = { reason: "circular" };
    circularError.self = circularError;

    expect(
      buildStreamErrorMessage({
        payload: { error: circularError },
        runId: "run-1",
      }).content.parts,
    ).toEqual([{ text: "[object Object]", type: "text" }]);

    const hostileError: Record<string, unknown> = {
      toString: () => {
        throw new Error("Cannot stringify");
      },
    };
    hostileError.self = hostileError;

    expect(
      buildStreamErrorMessage({
        payload: { error: hostileError },
        runId: "run-1",
      }).content.parts,
    ).toEqual([{ text: "Unknown error", type: "text" }]);
  });
});
