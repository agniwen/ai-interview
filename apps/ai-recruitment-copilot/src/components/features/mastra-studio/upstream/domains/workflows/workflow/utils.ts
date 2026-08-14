import Dagre from "@dagrejs/dagre";
import type { Workflow, SerializedStepFlowEntry } from "@mastra/core/workflows";
import { MarkerType } from "@xyflow/react";
import type { WorkflowDataEdgeModel } from "./workflow-data-edge";
import {
  resolveWorkflowGraphStep,
  WORKFLOW_BOUNDARY_NODE_TYPE,
  WORKFLOW_STEP_NODE_TYPE,
} from "./workflow-step-node-utils";
import type { WorkflowBoundaryNode, WorkflowStepNode } from "./workflow-step-node-utils";

const getWorkflowBoundaryNodeId = (role: "start" | "end") => `boundary-${role}`;
const WORKFLOW_START_NODE_ID = getWorkflowBoundaryNodeId("start");
const WORKFLOW_END_NODE_ID = getWorkflowBoundaryNodeId("end");

const getWorkflowNodeId = (stepId: string) => `node-${stepId}`;
const getWorkflowConditionNodeId = (conditionId: string) => `condition-node-${conditionId}`;
const getWorkflowEdgeId = (source: string, target: string, domain = "step") =>
  `edge-${domain}-${source}-${target}`;

export type WorkflowGraphNode = WorkflowStepNode | WorkflowBoundaryNode;
export type WorkflowGraphEdge = WorkflowDataEdgeModel;

const normalizeDuplicateEdgeIds = (edges: WorkflowGraphEdge[]): WorkflowGraphEdge[] => {
  const usedEdgeIds = new Set<string>();

  return edges.map((edge) => {
    if (!usedEdgeIds.has(edge.id)) {
      usedEdgeIds.add(edge.id);
      return edge;
    }

    let suffix = 1;
    let nextId = `${edge.id}-${suffix}`;
    while (usedEdgeIds.has(nextId)) {
      suffix += 1;
      nextId = `${edge.id}-${suffix}`;
    }
    usedEdgeIds.add(nextId);

    return {
      ...edge,
      id: nextId,
    };
  });
};

const getNodeSize = (node: WorkflowGraphNode): { width: number; height: number } => {
  if (node.type === WORKFLOW_BOUNDARY_NODE_TYPE) {
    return {
      height: node.measured?.height ?? 56,
      width: node.measured?.width ?? 56,
    };
  }

  return {
    height: node.measured?.height ?? (node?.data?.isLarge ? 260 : 100),
    width: node.measured?.width ?? 274,
  };
};

export type ConditionConditionType =
  | "if"
  | "else"
  | "when"
  | "until"
  | "while"
  | "dountil"
  | "dowhile";

export type Condition =
  | {
      type: ConditionConditionType;
      ref: {
        step:
          | {
              id: string;
            }
          | "trigger";
        path: string;
      };
      query: Record<string, unknown>;
      conj?: "and" | "or" | "not";
      fnString?: never;
    }
  | {
      type: ConditionConditionType;
      fnString: string;
      ref?: never;
      query?: never;
      conj?: never;
    };

const capitalizeWords = (value: string) =>
  value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatMappingLabel = (
  stepId: string,
  prevStepIds: string[],
  nextStepIds: string[],
): string => {
  // If not a mapping node, return original ID
  if (!stepId.startsWith("mapping_")) {
    return stepId;
  }

  const formatStepName = (id: string) => {
    // Remove common prefixes and clean up
    const cleaned = id.replace(/Step$/, "").replaceAll(/[-_]/g, " ").trim();
    return capitalizeWords(cleaned);
  };

  const formatMultipleSteps = (ids: string[], isTarget: boolean) => {
    if (ids.length === 0) {
      return isTarget ? "结束" : "开始";
    }
    if (ids.length === 1) {
      return formatStepName(ids[0]);
    }
    return `${ids.length} Steps`;
  };

  const fromLabel = formatMultipleSteps(prevStepIds, false);
  const toLabel = formatMultipleSteps(nextStepIds, true);

  return `${fromLabel} → ${toLabel} 映射`;
};

const getLayoutedElements = (nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]) => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB" });

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }
  for (const node of nodes) {
    g.setNode(node.id, {
      ...node,
      ...getNodeSize(node),
    });
  }

  Dagre.layout(g);

  const graph = g.graph();
  const fullWidth = graph?.width ? graph.width / 2 : 0;
  const fullHeight = graph?.height ? graph.height / 2 : 0;

  return {
    edges,
    fullHeight,
    fullWidth,
    nodes: nodes.map((node) => {
      const position = g.node(node.id);
      const { width, height } = getNodeSize(node);
      // We are shifting the dagre node position (anchor=center center) to the top left
      // so it matches the React Flow node anchor point (top left).
      const positionX = position.x - width / 2;
      const positionY = position.y - height / 2;
      const x = positionX;
      const y = positionY;

      return { ...node, position: { x, y } };
    }),
  };
};

const defaultEdgeOptions = {
  animated: true,
  markerEnd: {
    color: "#8e8e8e",
    height: 20,
    type: MarkerType.ArrowClosed,
    width: 20,
  },
};

const conditionWorkflowStep = (condition: { id: string; fn: string }) =>
  resolveWorkflowGraphStep({
    serializedConditions: [condition],
    steps: [],
    type: "conditional",
  });

export type WStep = Record<
  string,
  {
    id: string;
    description: string;
    workflowId?: string;
    stepGraph?: unknown;
    stepSubscriberGraph?: unknown;
  }
>;

interface StepNodeAndEdgeResult {
  nodes: WorkflowStepNode[];
  edges: WorkflowGraphEdge[];
  nextPrevNodeIds: string[];
  nextPrevStepIds: string[];
}

interface StepGraphContext {
  xIndex: number;
  yIndex: number;
  prevNodeIds: string[];
  prevStepIds: string[];
  nextStepFlow?: SerializedStepFlowEntry;
  condition?: { id: string; fn: string };
  allPrevNodeIds: Set<string>;
}

interface NextStepReferences {
  nodeIds: string[];
  stepIds: string[];
}

type BuildStepGraph = (
  input: StepGraphContext & { stepFlow: SerializedStepFlowEntry },
) => StepNodeAndEdgeResult;

const getUniqueStepId = (stepId: string, yIndex: number, allPrevNodeIds: Set<string>): string =>
  allPrevNodeIds.has(getWorkflowNodeId(stepId)) ? `${stepId}-${yIndex}` : stepId;

const getNextStepReferences = ({
  nextStepFlow,
  yIndex,
  allPrevNodeIds,
}: Pick<StepGraphContext, "nextStepFlow" | "yIndex" | "allPrevNodeIds">): NextStepReferences => {
  if (!nextStepFlow) {
    return { nodeIds: [], stepIds: [] };
  }

  if (
    nextStepFlow.type === "step" ||
    nextStepFlow.type === "foreach" ||
    nextStepFlow.type === "loop"
  ) {
    const stepId = nextStepFlow.step.id;
    const uniqueStepId = getUniqueStepId(stepId, yIndex + 1, allPrevNodeIds);
    return { nodeIds: [getWorkflowNodeId(uniqueStepId)], stepIds: [stepId] };
  }

  if (nextStepFlow.type === "sleep" || nextStepFlow.type === "sleepUntil") {
    const uniqueStepId = getUniqueStepId(nextStepFlow.id, yIndex + 1, allPrevNodeIds);
    return { nodeIds: [getWorkflowNodeId(uniqueStepId)], stepIds: [nextStepFlow.id] };
  }

  if (nextStepFlow.type === "parallel") {
    return {
      nodeIds: nextStepFlow.steps.map(({ step }) =>
        getWorkflowNodeId(getUniqueStepId(step.id, yIndex + 1, allPrevNodeIds)),
      ),
      stepIds: nextStepFlow.steps.map(({ step }) => step.id),
    };
  }

  if (nextStepFlow.type === "conditional") {
    return {
      nodeIds: nextStepFlow.serializedConditions.map(({ id }) => getWorkflowConditionNodeId(id)),
      stepIds: nextStepFlow.steps.map(({ step }) => step.id),
    };
  }

  return { nodeIds: [], stepIds: [] };
};

const createConditionNode = ({
  condition,
  nextStepId,
  previousStepId,
  withoutBottomHandle,
  withoutTopHandle,
  xIndex,
  yIndex,
}: {
  condition: { id: string; fn: string };
  nextStepId: string;
  previousStepId: string | undefined;
  withoutBottomHandle: boolean;
  withoutTopHandle: boolean;
  xIndex: number;
  yIndex: number;
}): WorkflowStepNode => ({
  data: {
    conditions: [{ fnString: condition.fn, type: "when" }],
    isLarge: true,
    label: condition.id,
    nextStepId,
    nodeRole: "condition",
    previousStepId,
    withoutBottomHandle,
    withoutTopHandle,
    workflowStep: conditionWorkflowStep(condition),
  },
  id: getWorkflowConditionNodeId(condition.id),
  position: { x: xIndex * 300, y: yIndex * 100 },
  type: WORKFLOW_STEP_NODE_TYPE,
});

const createStepEdges = ({
  condition,
  connectConditionWithoutPrevious,
  nextNodeIds,
  nextStepIds,
  nodeId,
  prevNodeIds,
  prevStepIds,
  stepId,
}: {
  condition: { id: string; fn: string } | undefined;
  connectConditionWithoutPrevious: boolean;
  nextNodeIds: string[];
  nextStepIds: string[];
  nodeId: string;
  prevNodeIds: string[];
  prevStepIds: string[];
  stepId: string;
}): WorkflowGraphEdge[] => {
  const edges: WorkflowGraphEdge[] = [];
  const conditionNodeId = condition ? getWorkflowConditionNodeId(condition.id) : undefined;

  for (const [index, previousNodeId] of prevNodeIds.entries()) {
    const target = conditionNodeId ?? nodeId;
    edges.push({
      data: {
        ...(condition ? { conditionNode: true } : {}),
        nextStepId: stepId,
        previousStepId: prevStepIds[index],
      },
      id: getWorkflowEdgeId(previousNodeId, target, condition ? "condition" : "step"),
      source: previousNodeId,
      target,
      ...defaultEdgeOptions,
    });
  }

  if (conditionNodeId && (connectConditionWithoutPrevious || prevNodeIds.length > 0)) {
    edges.push({
      data: {
        conditionNode: true,
        nextStepId: stepId,
        previousStepId: prevStepIds.at(-1),
      },
      id: getWorkflowEdgeId(conditionNodeId, nodeId, "condition"),
      source: conditionNodeId,
      target: nodeId,
      ...defaultEdgeOptions,
    });
  }

  for (const [index, nextNodeId] of nextNodeIds.entries()) {
    edges.push({
      data: { nextStepId: nextStepIds[index], previousStepId: stepId },
      id: getWorkflowEdgeId(nodeId, nextNodeId),
      source: nodeId,
      target: nextNodeId,
      ...defaultEdgeOptions,
    });
  }

  return edges;
};

const createLinearStepGraph = (
  stepFlow: Extract<SerializedStepFlowEntry, { type: "step" | "foreach" }>,
  context: StepGraphContext,
  nextSteps: NextStepReferences,
): StepNodeAndEdgeResult => {
  const { allPrevNodeIds, condition, prevNodeIds, prevStepIds, xIndex, yIndex } = context;
  const { nodeIds: nextNodeIds, stepIds: nextStepIds } = nextSteps;
  const stepId = stepFlow.step.id;
  const nodeId = getWorkflowNodeId(getUniqueStepId(stepId, yIndex, allPrevNodeIds));
  const nodes: WorkflowStepNode[] = [];

  if (condition) {
    nodes.push(
      createConditionNode({
        condition,
        nextStepId: stepId,
        previousStepId: prevStepIds.at(-1),
        withoutBottomHandle: nextNodeIds.length === 0,
        withoutTopHandle: prevNodeIds.length === 0,
        xIndex,
        yIndex,
      }),
    );
  }

  nodes.push({
    data: {
      canSuspend: stepFlow.step.canSuspend,
      description: stepFlow.step.description,
      isForEach: stepFlow.type === "foreach",
      label: formatMappingLabel(stepId, prevStepIds, nextStepIds),
      mapConfig: stepFlow.step.mapConfig,
      metadata: stepFlow.step.metadata,
      stepGraph:
        stepFlow.step.component === "WORKFLOW" ? stepFlow.step.serializedStepFlow : undefined,
      stepId,
      withoutBottomHandle: nextNodeIds.length === 0,
      withoutTopHandle: condition ? false : prevNodeIds.length === 0,
      workflowStep: resolveWorkflowGraphStep(stepFlow),
    },
    id: nodeId,
    position: { x: xIndex * 300, y: (yIndex + (condition ? 1 : 0)) * 100 },
    type: WORKFLOW_STEP_NODE_TYPE,
  });

  return {
    edges: createStepEdges({
      condition,
      connectConditionWithoutPrevious: true,
      nextNodeIds,
      nextStepIds,
      nodeId,
      prevNodeIds,
      prevStepIds,
      stepId,
    }),
    nextPrevNodeIds: [nodeId],
    nextPrevStepIds: [stepId],
    nodes,
  };
};

const createSleepStepGraph = (
  stepFlow: Extract<SerializedStepFlowEntry, { type: "sleep" | "sleepUntil" }>,
  context: StepGraphContext,
  nextSteps: NextStepReferences,
): StepNodeAndEdgeResult => {
  const { allPrevNodeIds, condition, prevNodeIds, prevStepIds, xIndex, yIndex } = context;
  const { nodeIds: nextNodeIds, stepIds: nextStepIds } = nextSteps;
  const stepId = stepFlow.id;
  const nodeId = getWorkflowNodeId(getUniqueStepId(stepId, yIndex, allPrevNodeIds));
  const nodes: WorkflowStepNode[] = [];

  if (condition) {
    nodes.push(
      createConditionNode({
        condition,
        nextStepId: stepId,
        previousStepId: prevStepIds.at(-1),
        withoutBottomHandle: nextNodeIds.length === 0,
        withoutTopHandle: false,
        xIndex,
        yIndex,
      }),
    );
  }

  const timingData =
    stepFlow.type === "sleepUntil" ? { date: stepFlow.date } : { duration: stepFlow.duration };
  nodes.push({
    data: {
      label: stepId,
      stepId,
      withoutBottomHandle: nextNodeIds.length === 0,
      withoutTopHandle: condition ? false : prevNodeIds.length === 0,
      workflowStep: resolveWorkflowGraphStep(stepFlow),
      ...timingData,
    },
    id: nodeId,
    position: { x: xIndex * 300, y: (yIndex + (condition ? 1 : 0)) * 100 },
    type: WORKFLOW_STEP_NODE_TYPE,
  });

  return {
    edges: createStepEdges({
      condition,
      connectConditionWithoutPrevious: false,
      nextNodeIds,
      nextStepIds,
      nodeId,
      prevNodeIds,
      prevStepIds,
      stepId,
    }),
    nextPrevNodeIds: [nodeId],
    nextPrevStepIds: [stepId],
    nodes,
  };
};

const createLoopStepGraph = (
  stepFlow: Extract<SerializedStepFlowEntry, { type: "loop" }>,
  context: StepGraphContext,
  nextSteps: NextStepReferences,
): StepNodeAndEdgeResult => {
  const { prevNodeIds, prevStepIds, xIndex, yIndex } = context;
  const { nodeIds: nextNodeIds, stepIds: nextStepIds } = nextSteps;
  const { loopType, serializedCondition, step } = stepFlow;
  const nodeId = getWorkflowNodeId(step.id);
  const conditionNodeId = getWorkflowConditionNodeId(serializedCondition.id);
  const nodes: WorkflowStepNode[] = [
    {
      data: {
        canSuspend: step.canSuspend,
        description: step.description,
        label: step.id,
        metadata: step.metadata,
        stepGraph: step.component === "WORKFLOW" ? step.serializedStepFlow : undefined,
        stepId: step.id,
        withoutBottomHandle: false,
        withoutTopHandle: prevNodeIds.length === 0,
        workflowStep: resolveWorkflowGraphStep(stepFlow),
      },
      id: nodeId,
      position: { x: xIndex * 300, y: yIndex * 100 },
      type: WORKFLOW_STEP_NODE_TYPE,
    },
    {
      data: {
        conditions: [{ fnString: serializedCondition.fn, type: loopType }],
        isLarge: true,
        label: serializedCondition.id,
        nextStepId: nextStepIds[0],
        nodeRole: "condition",
        previousStepId: step.id,
        withoutBottomHandle: nextNodeIds.length === 0,
        withoutTopHandle: false,
        workflowStep: conditionWorkflowStep(serializedCondition),
      },
      id: conditionNodeId,
      position: { x: xIndex * 300, y: (yIndex + 1) * 100 },
      type: WORKFLOW_STEP_NODE_TYPE,
    },
  ];
  const edges: WorkflowGraphEdge[] = [];

  for (const [index, previousNodeId] of prevNodeIds.entries()) {
    edges.push({
      data: { nextStepId: step.id, previousStepId: prevStepIds[index] },
      id: getWorkflowEdgeId(previousNodeId, nodeId),
      source: previousNodeId,
      target: nodeId,
      ...defaultEdgeOptions,
    });
  }

  edges.push({
    data: { nextStepId: nextStepIds[0], previousStepId: step.id },
    id: getWorkflowEdgeId(nodeId, conditionNodeId, "condition"),
    source: nodeId,
    target: conditionNodeId,
    ...defaultEdgeOptions,
  });

  for (const [index, nextNodeId] of nextNodeIds.entries()) {
    edges.push({
      data: { nextStepId: nextStepIds[index], previousStepId: step.id },
      id: getWorkflowEdgeId(conditionNodeId, nextNodeId, "condition"),
      source: conditionNodeId,
      target: nextNodeId,
      ...defaultEdgeOptions,
    });
  }

  return {
    edges,
    nextPrevNodeIds: [conditionNodeId],
    nextPrevStepIds: [step.id],
    nodes,
  };
};

const createParallelStepGraph = (
  stepFlow: Extract<SerializedStepFlowEntry, { type: "parallel" }>,
  context: StepGraphContext,
  buildStepGraph: BuildStepGraph,
): StepNodeAndEdgeResult => {
  const nodes: WorkflowStepNode[] = [];
  const edges: WorkflowGraphEdge[] = [];
  const nextPrevStepIds: string[] = [];

  for (const [index, childStepFlow] of stepFlow.steps.entries()) {
    const result = buildStepGraph({
      ...context,
      condition: undefined,
      stepFlow: childStepFlow,
      xIndex: index,
    });
    nodes.push(
      ...result.nodes.map((node) => ({
        ...node,
        data: { ...node.data, isParallel: true },
      })),
    );
    edges.push(...result.edges);
    nextPrevStepIds.push(...result.nextPrevStepIds);
  }

  return {
    edges,
    nextPrevNodeIds: nodes.map((node) => node.id),
    nextPrevStepIds,
    nodes,
  };
};

const createConditionalStepGraph = (
  stepFlow: Extract<SerializedStepFlowEntry, { type: "conditional" }>,
  context: StepGraphContext,
  buildStepGraph: BuildStepGraph,
): StepNodeAndEdgeResult => {
  const nodes: WorkflowStepNode[] = [];
  const edges: WorkflowGraphEdge[] = [];
  const nextPrevStepIds: string[] = [];

  for (const [index, childStepFlow] of stepFlow.steps.entries()) {
    const result = buildStepGraph({
      ...context,
      condition: stepFlow.serializedConditions[index],
      stepFlow: childStepFlow,
      xIndex: index,
    });
    nodes.push(...result.nodes);
    edges.push(...result.edges);
    nextPrevStepIds.push(...result.nextPrevStepIds);
  }

  return {
    edges,
    nextPrevNodeIds: nodes
      .filter(({ data }) => data.nodeRole !== "condition")
      .map((node) => node.id),
    nextPrevStepIds,
    nodes,
  };
};

function getStepNodeAndEdge({
  stepFlow,
  ...context
}: StepGraphContext & { stepFlow: SerializedStepFlowEntry }): StepNodeAndEdgeResult {
  const nextSteps = getNextStepReferences(context);

  if (stepFlow.type === "step" || stepFlow.type === "foreach") {
    return createLinearStepGraph(stepFlow, context, nextSteps);
  }
  if (stepFlow.type === "sleep" || stepFlow.type === "sleepUntil") {
    return createSleepStepGraph(stepFlow, context, nextSteps);
  }
  if (stepFlow.type === "loop") {
    return createLoopStepGraph(stepFlow, context, nextSteps);
  }
  if (stepFlow.type === "parallel") {
    return createParallelStepGraph(stepFlow, context, getStepNodeAndEdge);
  }
  if (stepFlow.type === "conditional") {
    return createConditionalStepGraph(stepFlow, context, getStepNodeAndEdge);
  }

  return { edges: [], nextPrevNodeIds: [], nextPrevStepIds: [], nodes: [] };
}

export const constructNodesAndEdges = ({
  stepGraph,
}: {
  stepGraph?: Workflow["serializedStepGraph"];
}): { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } => {
  if (!stepGraph) {
    return { edges: [], nodes: [] };
  }

  if (stepGraph.length === 0) {
    return { edges: [], nodes: [] };
  }

  let nodes: WorkflowStepNode[] = [];
  let edges: WorkflowGraphEdge[] = [];

  let prevNodeIds: string[] = [];
  let prevStepIds: string[] = [];
  const allPrevNodeIds = new Set<string>();

  for (let index = 0; index < stepGraph.length; index += 1) {
    const {
      nodes: _nodes,
      edges: _edges,
      nextPrevNodeIds,
      nextPrevStepIds,
    } = getStepNodeAndEdge({
      allPrevNodeIds,
      nextStepFlow: index === stepGraph.length - 1 ? undefined : stepGraph[index + 1],
      prevNodeIds,
      prevStepIds,
      stepFlow: stepGraph[index],
      xIndex: index,
      yIndex: index,
    });
    nodes.push(..._nodes);
    edges.push(..._edges);
    prevNodeIds = nextPrevNodeIds;
    prevStepIds = nextPrevStepIds;
    for (const nodeId of prevNodeIds) {
      allPrevNodeIds.add(nodeId);
    }
  }

  const edgeTargetIds = new Set(edges.map((edge) => edge.target));
  const edgeSourceIds = new Set(edges.map((edge) => edge.source));
  const sourceNodeIds = nodes.filter((node) => !edgeTargetIds.has(node.id)).map((node) => node.id);
  const terminalNodeIds = nodes
    .filter((node) => !edgeSourceIds.has(node.id))
    .map((node) => node.id);
  const sourceNodeIdSet = new Set(sourceNodeIds);
  const terminalNodeIdSet = new Set(terminalNodeIds);

  nodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      ...(sourceNodeIdSet.has(node.id) ? { withoutTopHandle: false } : {}),
      ...(terminalNodeIdSet.has(node.id) ? { withoutBottomHandle: false } : {}),
    },
  }));

  const graphNodes: WorkflowGraphNode[] = [
    {
      data: { boundaryRole: "start", label: "开始" },
      id: WORKFLOW_START_NODE_ID,
      position: { x: 0, y: 0 },
      type: WORKFLOW_BOUNDARY_NODE_TYPE,
    },
    ...nodes,
    {
      data: { boundaryRole: "end", label: "结束" },
      id: WORKFLOW_END_NODE_ID,
      position: { x: 0, y: 0 },
      type: WORKFLOW_BOUNDARY_NODE_TYPE,
    },
  ];

  const sourceBoundaryEdges: WorkflowGraphEdge[] = sourceNodeIds.map((nodeId) => ({
    data: {
      boundaryPayload: "workflow-input",
      nextStepId: (() => {
        const targetNode = graphNodes.find((node) => node.id === nodeId);
        if (targetNode?.type !== WORKFLOW_STEP_NODE_TYPE) {
          return nodeId;
        }
        return targetNode?.data.stepId ?? targetNode?.data.nextStepId ?? nodeId;
      })(),
    },
    id: getWorkflowEdgeId(WORKFLOW_START_NODE_ID, nodeId, "boundary"),
    source: WORKFLOW_START_NODE_ID,
    target: nodeId,
    ...defaultEdgeOptions,
  }));
  const terminalBoundaryEdges: WorkflowGraphEdge[] = terminalNodeIds.map((nodeId) => ({
    data: { boundaryPayload: "workflow-output" },
    id: getWorkflowEdgeId(nodeId, WORKFLOW_END_NODE_ID, "boundary"),
    source: nodeId,
    target: WORKFLOW_END_NODE_ID,
    ...defaultEdgeOptions,
  }));

  edges = [...sourceBoundaryEdges, ...edges, ...terminalBoundaryEdges];

  edges = normalizeDuplicateEdgeIds(edges);

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graphNodes, edges);

  return { edges: layoutedEdges, nodes: layoutedNodes };
};

export {
  allPredecessorsResolved,
  buildNextStepInput,
  buildStepSuccessors,
  buildStepsFlow,
  collectGraphStepFlags,
  findFocusNode,
  isBranchArmBypassed,
  isLastRunnableStep,
  selectNextStepKey,
} from "./workflow-step-flow-utils";
