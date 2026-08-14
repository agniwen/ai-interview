import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import type { EdgeProps, NodeProps } from "@xyflow/react";
import { useContext, useMemo } from "react";

import { useCurrentRun } from "../context/use-current-run";
import { WorkflowRunContext } from "../context/workflow-run-context";
import {
  buildStepSuccessors,
  buildStepsFlow,
  collectGraphStepFlags,
  isBranchArmBypassed,
} from "./utils";
import type { WorkflowGraphEdge } from "./utils";
import { WorkflowBoundaryNode } from "./workflow-boundary-node";
import { WorkflowDataEdge, WORKFLOW_DATA_EDGE_TYPE } from "./workflow-data-edge";
import { WorkflowGraphNode } from "./workflow-graph-node";
import { WORKFLOW_BOUNDARY_NODE_TYPE, WORKFLOW_STEP_NODE_TYPE } from "./workflow-step-node-utils";
import type {
  WorkflowBoundaryNode as WorkflowBoundaryNodeType,
  WorkflowStepNode,
} from "./workflow-step-node-utils";

const getScopedStepId = (stepId: string | undefined, workflowName?: string) =>
  stepId && workflowName ? `${workflowName}.${stepId}` : stepId;

function withEdgeStatus(edge: WorkflowGraphEdge, isFinished: boolean): WorkflowGraphEdge {
  return {
    ...edge,
    animated: isFinished ? false : edge.animated,
    data: { ...edge.data, edgeStatus: isFinished ? "success" : "idle" },
    style: {
      ...edge.style,
      stroke: isFinished ? "#22c55e" : "#8e8e8e",
      strokeDasharray: isFinished ? "none" : edge.style?.strokeDasharray,
    },
    type: WORKFLOW_DATA_EDGE_TYPE,
  };
}

function isEdgeFinished({
  boundaryPayload,
  conditionNode,
  nextStepBypassed,
  nextStepStatus,
  previousStepSucceeded,
  workflowSucceeded,
}: {
  boundaryPayload?: "workflow-input" | "workflow-output";
  conditionNode?: boolean;
  nextStepBypassed: boolean;
  nextStepStatus?: string;
  previousStepSucceeded: boolean;
  workflowSucceeded: boolean;
}) {
  if (boundaryPayload === "workflow-output") {
    return workflowSucceeded;
  }
  if (boundaryPayload === "workflow-input") {
    return Boolean(nextStepStatus) && nextStepStatus !== "skipped";
  }
  if (conditionNode) {
    return Boolean(nextStepStatus) && nextStepStatus !== "skipped" && !nextStepBypassed;
  }
  return previousStepSucceeded && nextStepStatus !== "skipped" && !nextStepBypassed;
}

export const useWorkflowGraphRuntime = ({
  edges,
  workflowName,
  stepGraph,
}: {
  edges: WorkflowGraphEdge[];
  workflowName?: string;
  stepGraph?: SerializedStepFlowEntry[];
}) => {
  const { steps } = useCurrentRun();
  const workflowRun = useContext(WorkflowRunContext);
  // For a nested graph the End edge should light when that nested workflow's own
  // step succeeds, not when the entire parent run finishes. For the top-level graph
  // there is no `workflowName`, so fall back to the overall run status.
  const workflowSucceeded = workflowName
    ? steps[workflowName]?.status === "success"
    : workflowRun.result?.status === "success";
  const stepsFlow = useMemo(() => buildStepsFlow(edges), [edges]);
  // A conditional resolves to a single arm; the other arms never enter run state
  // (their status stays `undefined`, not `skipped`). To keep their edges neutral
  // we detect bypassed arms from the static graph the same way the step controls do.
  const isArmBypassed = useMemo(() => {
    const stepSuccessors = buildStepSuccessors(stepsFlow);
    const { conditionalStepIds } = collectGraphStepFlags(
      stepGraph ?? workflowRun.workflow?.stepGraph,
    );
    const isStepSuccess = (stepId: string) =>
      steps[getScopedStepId(stepId, workflowName) ?? ""]?.status === "success";
    return (stepId: string | undefined) => {
      if (!stepId) {
        return false;
      }
      return isBranchArmBypassed({
        conditionalStepIds,
        isStepSuccess,
        stepId,
        stepSuccessors,
        stepsFlow,
      });
    };
  }, [stepsFlow, stepGraph, workflowRun.workflow?.stepGraph, steps, workflowName]);
  const nodeTypes = useMemo(
    () => ({
      [WORKFLOW_STEP_NODE_TYPE]: (props: NodeProps<WorkflowStepNode>) => (
        <WorkflowGraphNode parentWorkflowName={workflowName} {...props} stepsFlow={stepsFlow} />
      ),
      [WORKFLOW_BOUNDARY_NODE_TYPE]: (props: NodeProps<WorkflowBoundaryNodeType>) => (
        <WorkflowBoundaryNode {...props} />
      ),
    }),
    [stepsFlow, workflowName],
  );
  const edgeTypes = useMemo(
    () => ({
      [WORKFLOW_DATA_EDGE_TYPE]: (props: EdgeProps<WorkflowGraphEdge>) => (
        <WorkflowDataEdge parentWorkflowName={workflowName} {...props} />
      ),
    }),
    [workflowName],
  );
  const styledEdges = useMemo(
    () =>
      edges.map((edge) => {
        const previousStepId = getScopedStepId(edge.data?.previousStepId, workflowName);
        const nextStepId = getScopedStepId(edge.data?.nextStepId, workflowName);
        const previousStepSucceeded = steps[previousStepId ?? ""]?.status === "success";
        const nextStepStatus = steps[nextStepId ?? ""]?.status;
        // A conditional arm that lost the branch decision never runs, so its status
        // stays `undefined`. Treat such a bypassed arm like an explicitly skipped step
        // so edges feeding it stay neutral.
        const nextStepBypassed = isArmBypassed(edge.data?.nextStepId);
        const isFinished = isEdgeFinished({
          boundaryPayload: edge.data?.boundaryPayload,
          conditionNode: edge.data?.conditionNode,
          nextStepBypassed,
          nextStepStatus,
          previousStepSucceeded,
          workflowSucceeded,
        });
        return withEdgeStatus(edge, isFinished);
      }),
    [edges, steps, workflowName, workflowSucceeded, isArmBypassed],
  );

  return { edgeTypes, nodeTypes, stepsFlow, styledEdges };
};
