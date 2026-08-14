import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import { describe, expect, it } from "vitest";
import { buildStepSuccessors, collectGraphStepFlags, selectNextStepKey } from "./utils";

describe("workflow step flow", () => {
  it("builds a deduplicated successor map", () => {
    expect(buildStepSuccessors({ b: ["a"], join: ["b", "b", "c"] })).toEqual({
      a: ["b"],
      b: ["join"],
      c: ["join"],
    });
  });

  it("distinguishes conditional and nested workflow steps", () => {
    const graph = [
      {
        steps: [
          { step: { id: "short" }, type: "step" },
          { step: { id: "long" }, type: "step" },
        ],
        type: "conditional",
      },
      { step: { component: "WORKFLOW", id: "nested" }, type: "step" },
    ] as unknown as SerializedStepFlowEntry[];

    const flags = collectGraphStepFlags(graph);
    expect([...flags.conditionalStepIds]).toEqual(["short", "long"]);
    expect([...flags.nestedWorkflowStepIds]).toEqual(["nested"]);
  });

  it("selects the next unresolved, non-bypassed step", () => {
    expect(
      selectNextStepKey({
        isStepBypassed: (id) => id === "b",
        isStepSuccess: (id) => id === "a",
        stepNodesInOrder: ["a", "b", "c"],
      }),
    ).toBe("c");
  });
});
