import type { GetWorkflowResponse, ListWorkflowRunsResponse } from "@mastra/client-js";

type WorkflowRunSnapshot = Exclude<ListWorkflowRunsResponse["runs"][number]["snapshot"], string>;
type WorkflowRunStatus = WorkflowRunSnapshot["status"];

export const WORKFLOW_ID = "badge-workflow";
const WORKFLOW_NAME = "Badge Workflow";

/** A workflow whose stepGraph has one real step so the graph renders a node. */
export const badgeWorkflow = {
  name: WORKFLOW_NAME,
  stepGraph: [{ step: { description: "", id: "step-a" }, type: "step" }],
} satisfies Pick<GetWorkflowResponse, "name" | "stepGraph">;

const RUN_BASE = new Date(2026, 4, 29, 16, 19, 44);

function snapshot(runId: string, status: WorkflowRunStatus): WorkflowRunSnapshot {
  return {
    activePaths: [],
    activeStepsPath: {},
    context: {},
    resumeLabels: {},
    runId,
    serializedStepGraph: [{ step: { description: "", id: "step-a" }, type: "step" }],
    status,
    suspendedPaths: {},
    timestamp: RUN_BASE.getTime(),
    value: {},
    waitingPaths: {},
  } satisfies WorkflowRunSnapshot;
}

export const RUN_ID = "badge-run-1";

export const badgeWorkflowRuns: ListWorkflowRunsResponse = {
  runs: [
    {
      createdAt: RUN_BASE,
      runId: RUN_ID,
      snapshot: snapshot(RUN_ID, "success"),
      updatedAt: RUN_BASE,
      workflowName: WORKFLOW_NAME,
    },
  ],
  total: 1,
};
