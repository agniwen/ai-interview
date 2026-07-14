import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import type { ResolvedWorkflowStep } from "@mastra/react";
import type { Node } from "@xyflow/react";
import type { Condition } from "./utils";

export const WORKFLOW_STEP_NODE_TYPE = "workflow-step-node";
export const WORKFLOW_BOUNDARY_NODE_TYPE = "workflow-boundary-node";

export interface WorkflowStepNodeData extends Record<string, unknown> {
  label: string;
  workflowStep: ResolvedWorkflowStep;
  stepId?: string;
  description?: string;
  withoutTopHandle?: boolean;
  withoutBottomHandle?: boolean;
  stepGraph?: SerializedStepFlowEntry[];
  mapConfig?: string;
  duration?: number;
  date?: Date;
  isParallel?: boolean;
  canSuspend?: boolean;
  isForEach?: boolean;
  isLarge?: boolean;
  metadata?: Record<string, unknown>;
  nodeRole?: "step" | "condition";
  conditions?: Condition[];
  previousStepId?: string;
  nextStepId?: string;
}

export type WorkflowStepNode = Node<WorkflowStepNodeData, typeof WORKFLOW_STEP_NODE_TYPE>;

export interface WorkflowBoundaryNodeData extends Record<string, unknown> {
  label: "Start" | "End";
  boundaryRole: "start" | "end";
}

export type WorkflowBoundaryNode = Node<
  WorkflowBoundaryNodeData,
  typeof WORKFLOW_BOUNDARY_NODE_TYPE
>;

export const resolveWorkflowGraphStep = (flow: SerializedStepFlowEntry): ResolvedWorkflowStep => {
  switch (flow.type) {
    case "step": {
      if (flow.step.component === "WORKFLOW") {
        return {
          flow,
          id: flow.step.id,
          kind: "nested-workflow-step",
          step: flow.step,
        };
      }

      if (flow.step.mapConfig) {
        return {
          flow,
          id: flow.step.id,
          kind: "map-step",
          step: flow.step,
        };
      }

      return {
        flow,
        id: flow.step.id,
        kind: "step",
        step: flow.step,
      };
    }
    case "foreach": {
      return {
        flow,
        id: flow.step.id,
        kind: "foreach-step",
        step: flow.step,
      };
    }
    case "parallel": {
      return {
        flow,
        id: "parallel",
        kind: "parallel-step",
      };
    }
    case "conditional": {
      return {
        flow,
        id: flow.serializedConditions[0]?.id ?? "conditional",
        kind: "conditional",
      };
    }
    case "loop": {
      return {
        flow,
        id: flow.step.id,
        kind: "loop-step",
        step: flow.step,
      };
    }
    case "sleep": {
      return {
        flow,
        id: flow.id,
        kind: "sleep-step",
      };
    }
    case "sleepUntil": {
      return {
        flow,
        id: flow.id,
        kind: "sleep-until-step",
      };
    }
  }
};
