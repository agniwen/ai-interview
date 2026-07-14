import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import type { Node } from "@xyflow/react";

import type { WorkflowDataEdgeModel } from "./workflow-data-edge";

type StepStatusLookup = (stepId: string) => boolean;

export const buildStepsFlow = (edges: WorkflowDataEdgeModel[]): Record<string, string[]> => {
  const stepsFlow: Record<string, string[]> = {};

  for (const edge of edges) {
    if (!edge.data || edge.data.boundaryPayload) {
      continue;
    }

    const stepId = edge.data.nextStepId;
    const { previousStepId } = edge.data;
    if (!stepId || !previousStepId) {
      continue;
    }

    stepsFlow[stepId] = [...new Set([...(stepsFlow[stepId] ?? []), previousStepId])];
  }

  return stepsFlow;
};

/**
 * Invert the predecessor map (step -> its predecessors) into a successor map
 * (step -> the steps that depend on it). Branch arms feed the same downstream
 * join node, so this lets us detect arms that were never taken once a sibling
 * on the same join has already succeeded.
 */
export const buildStepSuccessors = (
  stepsFlow: Record<string, string[]>,
): Record<string, string[]> => {
  const successors: Record<string, string[]> = {};

  for (const [stepId, previousStepIds] of Object.entries(stepsFlow)) {
    for (const previousStepId of previousStepIds) {
      successors[previousStepId] = [...new Set([...(successors[previousStepId] ?? []), stepId])];
    }
  }

  return successors;
};

/**
 * Walk the serialized step graph to flag two special kinds of step:
 * - `conditionalStepIds`: arms of a conditional entry. Only these can be
 *   "bypassed" — when one branch arm is selected, the others never run.
 *   Parallel arms also share a downstream join, but every parallel arm must
 *   run, so they are deliberately NOT collected here.
 * - `nestedWorkflowStepIds`: steps whose component is a nested workflow. From
 *   the parent's perspective a nested workflow is a single atomic step.
 */
export const collectGraphStepFlags = (
  stepGraph: SerializedStepFlowEntry[] | undefined,
): { conditionalStepIds: Set<string>; nestedWorkflowStepIds: Set<string> } => {
  const conditionalStepIds = new Set<string>();
  const nestedWorkflowStepIds = new Set<string>();

  const visit = (entry: SerializedStepFlowEntry | undefined) => {
    if (!entry) {
      return;
    }
    if (
      (entry.type === "step" || entry.type === "foreach" || entry.type === "loop") &&
      entry.step?.component === "WORKFLOW" &&
      entry.step.id
    ) {
      nestedWorkflowStepIds.add(entry.step.id);
    }
    if (entry.type === "conditional") {
      for (const child of entry.steps) {
        conditionalStepIds.add(child.step.id);
        visit(child);
      }
    }
    if (entry.type === "parallel") {
      for (const child of entry.steps) {
        visit(child);
      }
    }
  };

  for (const entry of stepGraph ?? []) {
    visit(entry);
  }

  return { conditionalStepIds, nestedWorkflowStepIds };
};

/**
 * A conditional branch arm is "bypassed" when one of its successors (a join
 * such as a post-branch map) already has another predecessor that succeeded.
 * That means a sibling arm was the one selected by the condition, so this arm
 * will never run and must be skipped — otherwise per-step execution stalls on
 * it forever. Parallel arms are excluded via `conditionalStepIds`, because
 * every parallel arm is expected to run even though they share a join.
 */
export const isBranchArmBypassed = ({
  stepId,
  conditionalStepIds,
  stepSuccessors,
  stepsFlow,
  isStepSuccess,
}: {
  stepId: string;
  conditionalStepIds: Set<string>;
  stepSuccessors: Record<string, string[]>;
  stepsFlow: Record<string, string[]>;
  isStepSuccess: StepStatusLookup;
}): boolean => {
  if (!conditionalStepIds.has(stepId)) {
    return false;
  }
  const successors = stepSuccessors[stepId] ?? [];
  return successors.some((successorId) =>
    (stepsFlow[successorId] ?? []).some(
      (siblingId) => siblingId !== stepId && isStepSuccess(siblingId),
    ),
  );
};

/**
 * The next step to advance is the first step in graph order that has not yet
 * succeeded and was not bypassed by a conditional branch decision.
 */
export const selectNextStepKey = ({
  stepNodesInOrder,
  isStepSuccess,
  isStepBypassed,
}: {
  stepNodesInOrder: string[];
  isStepSuccess: StepStatusLookup;
  isStepBypassed: StepStatusLookup;
}): string | undefined =>
  stepNodesInOrder.find((stepId) => !isStepSuccess(stepId) && !isStepBypassed(stepId));

/**
 * A step is the last runnable one when no later step in graph order still needs
 * to run (ignoring bypassed branch arms). The final advance must finish the run
 * instead of pausing again, otherwise the workflow ends in a 'paused' state and
 * the user never sees the run's end output.
 */
export const isLastRunnableStep = ({
  nextStepKey,
  stepNodesInOrder,
  isStepSuccess,
  isStepBypassed,
}: {
  nextStepKey: string | undefined;
  stepNodesInOrder: string[];
  isStepSuccess: StepStatusLookup;
  isStepBypassed: StepStatusLookup;
}): boolean => {
  if (!nextStepKey) {
    return false;
  }
  const nextIndex = stepNodesInOrder.indexOf(nextStepKey);
  return stepNodesInOrder
    .slice(nextIndex + 1)
    .every((stepId) => isStepSuccess(stepId) || isStepBypassed(stepId));
};

/**
 * A join is ready when every predecessor is accounted for: it either succeeded
 * (it produced an output to forward) or it was bypassed (a dead conditional-branch
 * arm that will never run). A still-running or pending arm leaves the join unresolved.
 * Parallel arms are never bypassed, so a paused parallel join only resolves once all
 * arms succeed.
 */
export const allPredecessorsResolved = (
  previousSteps: string[],
  steps: Record<string, { status?: string }> | undefined,
  isBypassed: (stepId: string) => boolean = () => false,
): boolean =>
  previousSteps.every((stepId) => steps?.[stepId]?.status === "success" || isBypassed(stepId));

/**
 * Resolve the graph node that represents a given step id. Default/parallel nodes
 * carry `data.stepId`; condition nodes fall back to `data.label`. Returns
 * undefined when no node matches (e.g. before React Flow has laid out the graph).
 */
export const findFocusNode = (nodes: Node[], stepId: string): Node | undefined =>
  nodes.find((node) => (node.data?.stepId ?? node.data?.label) === stepId);

/**
 * Build the input payload for the next step from its resolved predecessors:
 * - A join with multiple predecessors yields a keyed map of each succeeded
 *   predecessor's output (`hasMultiSteps`); bypassed dead branch arms are excluded.
 * - A single predecessor yields its output directly.
 * Returns undefined when the step has no predecessor, or when any predecessor is
 * still unresolved (not succeeded and not bypassed) — e.g. a paused parallel join
 * where only some arms have finished.
 */
export const buildNextStepInput = ({
  nextStepKey,
  stepsFlow,
  steps,
  isStepBypassed = () => false,
}: {
  nextStepKey: string | undefined;
  stepsFlow: Record<string, string[]>;
  steps: Record<string, { status?: string; output?: unknown }> | undefined;
  isStepBypassed?: (stepId: string) => boolean;
}): { hasMultiSteps: boolean; input: unknown } | undefined => {
  if (!nextStepKey) {
    return undefined;
  }
  const previousSteps = stepsFlow[nextStepKey] ?? [];
  if (previousSteps.length === 0) {
    return undefined;
  }

  if (previousSteps.length > 1) {
    if (!allPredecessorsResolved(previousSteps, steps, isStepBypassed)) {
      return undefined;
    }

    const input: Record<string, unknown> = {};
    for (const stepId of previousSteps) {
      if (steps?.[stepId]?.status === "success") {
        input[stepId] = steps[stepId].output;
      }
    }

    return { hasMultiSteps: true, input };
  }

  const [previousStepId] = previousSteps;
  if (steps?.[previousStepId]?.status !== "success") {
    return undefined;
  }

  return {
    hasMultiSteps: false,
    input: steps[previousStepId].output,
  };
};
