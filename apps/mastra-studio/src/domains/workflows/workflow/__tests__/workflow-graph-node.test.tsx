import type { GetWorkflowResponse } from "@mastra/client-js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type * as React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkflowRunContext } from "../../context/workflow-run-context";
import { WorkflowSelectedStepProvider } from "../../context/workflow-selected-step-context";
import { WorkflowStepDetailProvider } from "../../context/workflow-step-detail-provider";
import { WorkflowGraphNode } from "../workflow-graph-node";
import { resolveWorkflowGraphStep, WORKFLOW_STEP_NODE_TYPE } from "../workflow-step-node-utils";
import type { WorkflowStepNode, WorkflowStepNodeData } from "../workflow-step-node-utils";

afterEach(() => cleanup());

type RunContextValue = React.ComponentProps<typeof WorkflowRunContext.Provider>["value"];

const renderNode = (data: WorkflowStepNodeData, contextValue?: RunContextValue) => {
  const props = {
    data,
    dragging: false,
    id: data.label,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    type: WORKFLOW_STEP_NODE_TYPE,
    zIndex: 0,
  } as NodeProps<WorkflowStepNode>;

  return render(
    <ReactFlowProvider>
      <WorkflowRunContext.Provider value={(contextValue ?? {}) as RunContextValue}>
        <WorkflowSelectedStepProvider>
          <WorkflowStepDetailProvider>
            <WorkflowGraphNode {...props} stepsFlow={{}} />
          </WorkflowStepDetailProvider>
        </WorkflowSelectedStepProvider>
      </WorkflowRunContext.Provider>
    </ReactFlowProvider>,
  );
};

function stepGraph(...stepIds: string[]): GetWorkflowResponse["stepGraph"] {
  return stepIds.map((stepId) => ({
    step: { description: "", id: stepId },
    type: "step",
  })) as GetWorkflowResponse["stepGraph"];
}

describe("WorkflowGraphNode", () => {
  it("renders map steps through the unified default node surface", async () => {
    renderNode({
      description: "Map the previous output",
      label: "map-step",
      mapConfig: "return input",
      stepId: "map-step",
      workflowStep: resolveWorkflowGraphStep({
        step: { description: "Map the previous output", id: "map-step", mapConfig: "return input" },
        type: "step",
      }),
    });

    expect(screen.getByTestId("workflow-default-node").dataset.workflowStepStatus).toBe("idle");
    expect(screen.getByText("map-step")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Map step" })).not.toBeNull();
    expect(screen.queryByText("MAP")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step actions" }));
    expect(await screen.findByText("Map config")).not.toBeNull();
  });

  it("marks the step a paused run is waiting on as the active step", () => {
    // step-a already succeeded, so the paused run is waiting on step-b. The waiting
    // step must be visibly marked so the user can always tell which step is active,
    // even when the viewport fails to recenter on it.
    renderNode(
      {
        label: "step-b",
        stepId: "step-b",
        workflowStep: resolveWorkflowGraphStep({
          step: { description: "", id: "step-b" },
          type: "step",
        }),
      },
      {
        result: { status: "paused", steps: { "step-a": { status: "success" } } },
        workflow: { name: "Wf", stepGraph: stepGraph("step-a", "step-b") },
      } as unknown as RunContextValue,
    );

    expect(screen.getByTestId("workflow-default-node").dataset.workflowStepWaiting).toBe("true");
  });

  it("does not mark a non-waiting step as the active step", () => {
    // The run is waiting on step-b, so step-a (already succeeded) must not be marked.
    renderNode(
      {
        label: "step-a",
        stepId: "step-a",
        workflowStep: resolveWorkflowGraphStep({
          step: { description: "", id: "step-a" },
          type: "step",
        }),
      },
      {
        result: { status: "paused", steps: { "step-a": { status: "success" } } },
        workflow: { name: "Wf", stepGraph: stepGraph("step-a", "step-b") },
      } as unknown as RunContextValue,
    );

    expect(
      screen.getByTestId("workflow-default-node").dataset.workflowStepWaiting,
    ).toBeUndefined();
  });

  it("renders conditions through the unified condition node surface", () => {
    renderNode({
      conditions: [{ fnString: "input.value > 0", type: "when" }],
      label: "condition-1",
      nextStepId: "next",
      nodeRole: "condition",
      previousStepId: "previous",
      workflowStep: resolveWorkflowGraphStep({
        serializedConditions: [{ fn: "input.value > 0", id: "condition-1" }],
        steps: [],
        type: "conditional",
      }),
    });

    const conditionNode = screen.getByTestId("workflow-condition-node");
    expect(conditionNode).not.toBeNull();
    expect(screen.getByRole("img", { name: "When condition" })).not.toBeNull();
    expect(screen.queryByText("WHEN")).toBeNull();
    expect(conditionNode.textContent).toContain("input.value > 0");
  });
});
