import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import { describe, expect, it } from "vitest";
import { constructNodesAndEdges } from "../utils";
import {
  resolveWorkflowGraphStep,
  WORKFLOW_BOUNDARY_NODE_TYPE,
  WORKFLOW_STEP_NODE_TYPE,
} from "../workflow-step-node-utils";

const step = (id: string) => ({ description: `${id} description`, id });

describe("resolveWorkflowGraphStep", () => {
  it.each([
    [{ step: step("regular"), type: "step" }, "step"],
    [{ step: { ...step("map"), mapConfig: "return input" }, type: "step" }, "map-step"],
    [{ opts: { concurrency: 2 }, step: step("each"), type: "foreach" }, "foreach-step"],
    [{ steps: [{ step: step("a"), type: "step" }], type: "parallel" }, "parallel-step"],
    [
      {
        serializedConditions: [{ fn: "true", id: "condition-1" }],
        steps: [{ step: step("when-true"), type: "step" }],
        type: "conditional",
      },
      "conditional",
    ],
    [
      {
        loopType: "dountil",
        serializedCondition: { fn: "true", id: "loop-condition" },
        step: step("loop"),
        type: "loop",
      },
      "loop-step",
    ],
    [{ duration: 1000, id: "sleep", type: "sleep" }, "sleep-step"],
    [{ date: new Date(0), id: "sleep-until", type: "sleepUntil" }, "sleep-until-step"],
    [
      {
        step: {
          ...step("nested"),
          component: "WORKFLOW",
          serializedStepFlow: [{ step: step("child"), type: "step" }],
        },
        type: "step",
      },
      "nested-workflow-step",
    ],
  ] satisfies [SerializedStepFlowEntry, string][])("maps %s to %s", (flow, kind) => {
    expect(resolveWorkflowGraphStep(flow).kind).toBe(kind);
  });

  it("keeps workflow graph nodes on one React Flow node type with resolved step data", () => {
    const { nodes, edges } = constructNodesAndEdges({
      stepGraph: [
        { step: step("regular"), type: "step" },
        { step: { ...step("map"), mapConfig: "return input" }, type: "step" },
        { duration: 1000, id: "sleep", type: "sleep" },
      ],
    });

    const stepNodes = nodes.filter((node) => node.type === WORKFLOW_STEP_NODE_TYPE);

    expect(nodes).toHaveLength(5);
    expect(nodes[0].id).toBe("boundary-start");
    expect(nodes[0].type).toBe(WORKFLOW_BOUNDARY_NODE_TYPE);
    expect(nodes[0].data.label).toBe("Start");
    expect(nodes.at(-1)?.id).toBe("boundary-end");
    expect(nodes.at(-1)?.type).toBe(WORKFLOW_BOUNDARY_NODE_TYPE);
    expect(nodes.at(-1)?.data.label).toBe("End");
    expect(stepNodes).toHaveLength(3);
    expect(stepNodes.map((node) => node.id)).toEqual(["node-regular", "node-map", "node-sleep"]);
    expect(stepNodes.map((node) => node.data.stepId)).toEqual(["regular", "map", "sleep"]);
    expect(stepNodes.map((node) => node.data.workflowStep.kind)).toEqual([
      "step",
      "map-step",
      "sleep-step",
    ]);
    expect(stepNodes[0].data.withoutTopHandle).toBe(false);
    expect(stepNodes.at(-1)?.data.withoutBottomHandle).toBe(false);
    expect(
      edges.some(
        (edge) =>
          edge.id === "edge-boundary-boundary-start-node-regular" &&
          edge.source === "boundary-start" &&
          edge.target === "node-regular" &&
          edge.data?.nextStepId === "regular",
      ),
    ).toBe(true);
    expect(
      edges.some(
        (edge) =>
          edge.id === "edge-boundary-node-sleep-boundary-end" &&
          edge.source === "node-sleep" &&
          edge.target === "boundary-end",
      ),
    ).toBe(true);
  });

  it("namespaces graph IDs by domain while preserving raw workflow metadata", () => {
    const { nodes, edges } = constructNodesAndEdges({
      stepGraph: [
        { step: step("shared"), type: "step" },
        {
          serializedConditions: [{ fn: "input.value === true", id: "shared" }],
          steps: [{ step: step("shared"), type: "step" }],
          type: "conditional",
        },
      ],
    });

    const nodeIds = nodes.map((node) => node.id);
    const edgeIds = edges.map((edge) => edge.id);
    const stepNodes = nodes.filter(
      (node) => node.type === WORKFLOW_STEP_NODE_TYPE && node.data.nodeRole !== "condition",
    );
    const conditionNodes = nodes.filter(
      (node) => node.type === WORKFLOW_STEP_NODE_TYPE && node.data.nodeRole === "condition",
    );

    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    expect(stepNodes.every((node) => node.id.startsWith("node-"))).toBe(true);
    expect(conditionNodes.every((node) => node.id.startsWith("condition-node-"))).toBe(true);
    expect(edges.every((edge) => edge.id.startsWith("edge-"))).toBe(true);
    expect(nodeIds).toContain("node-shared");
    expect(nodeIds).toContain("node-shared-1");
    expect(nodeIds).toContain("condition-node-shared");
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ nextStepId: "shared", previousStepId: "shared" }),
          source: "node-shared",
          target: "condition-node-shared",
        }),
        expect.objectContaining({
          data: expect.objectContaining({ nextStepId: "shared", previousStepId: "shared" }),
          source: "condition-node-shared",
          target: "node-shared-1",
        }),
      ]),
    );
  });
});
