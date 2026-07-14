import type { GetWorkflowRunByIdResponse, ListWorkflowRunsResponse } from "@mastra/client-js";
import type { WorkflowRunState, WorkflowRunStatus } from "@mastra/core/workflows";

const WORKFLOW_NAME = "demo-workflow";

function snapshot(runId: string, status: WorkflowRunStatus): WorkflowRunState {
  return {
    activePaths: [],
    activeStepsPath: {},
    context: {},
    resumeLabels: {},
    runId,
    serializedStepGraph: [],
    status,
    suspendedPaths: {},
    timestamp: new Date(2026, 4, 29, 16, 19, 44).getTime(),
    value: {},
    waitingPaths: {},
  };
}

export function workflowRun(runId: string, status: WorkflowRunStatus) {
  const createdAt = new Date(2026, 4, 29, 16, 19, 44);
  return {
    createdAt,
    runId,
    snapshot: snapshot(runId, status),
    updatedAt: createdAt,
    workflowName: WORKFLOW_NAME,
  };
}

export const emptyWorkflowRuns: ListWorkflowRunsResponse = {
  runs: [],
  total: 0,
};

export const oneSuccessfulRun: ListWorkflowRunsResponse = {
  runs: [workflowRun("run-success-1", "success")],
  total: 1,
};

const inputStep = {
  endedAt: new Date(2026, 4, 29, 16, 19, 44).getTime(),
  output: { city: "Paris" },
  payload: {},
  startedAt: new Date(2026, 4, 29, 16, 19, 44).getTime(),
  status: "success",
} as const;
const runWithInput = workflowRun("run-with-input", "success");

export const runsWithInput: ListWorkflowRunsResponse = {
  runs: [
    {
      ...runWithInput,
      snapshot: {
        ...runWithInput.snapshot,
        context: { input: inputStep },
      },
    },
  ],
  total: 1,
};

const RUN_BASE = new Date(2026, 4, 29, 16, 19, 44);

/**
 * A run-by-id response with two completed steps and one running step, used to
 * drive the workflow timeline through the real WorkflowRunProvider.
 *
 * step-a:  starts at +0ms,    ends at +1000ms  (success)
 * step-b:  starts at +1000ms, ends at +3000ms  (success)
 * step-c:  starts at +3000ms, no endedAt       (running)
 */
export const runWithTimedSteps: GetWorkflowRunByIdResponse = {
  createdAt: RUN_BASE,
  runId: "run-timeline-1",
  serializedStepGraph: [],
  status: "running",
  steps: {
    "step-a": {
      endedAt: RUN_BASE.getTime() + 1000,
      startedAt: RUN_BASE.getTime(),
      status: "success",
    },
    "step-b": {
      endedAt: RUN_BASE.getTime() + 3000,
      startedAt: RUN_BASE.getTime() + 1000,
      status: "success",
    },
    "step-c": {
      startedAt: RUN_BASE.getTime() + 3000,
      status: "running",
    },
  },
  updatedAt: RUN_BASE,
  workflowName: WORKFLOW_NAME,
};

/**
 * A run-by-id response whose only step entry is `input`, used to assert the
 * timeline stays hidden until real steps exist.
 */
export const runWithOnlyInput: GetWorkflowRunByIdResponse = {
  createdAt: RUN_BASE,
  runId: "run-timeline-empty",
  serializedStepGraph: [],
  status: "success",
  steps: {},
  updatedAt: RUN_BASE,
  workflowName: WORKFLOW_NAME,
};

/**
 * A run-by-id response with a single suspended step (`step-1`) waiting on user
 * input, used to drive the suspended overlay through the real
 * WorkflowRunProvider. The step id matches `baseWorkflow.allSteps`.
 */
export const runWithSuspendedStep: GetWorkflowRunByIdResponse = {
  createdAt: RUN_BASE,
  runId: "run-suspended-1",
  serializedStepGraph: [],
  status: "suspended",
  steps: {
    "step-1": {
      startedAt: RUN_BASE.getTime(),
      status: "suspended",
      suspendPayload: { reason: "needs approval" },
    },
  },
  updatedAt: RUN_BASE,
  workflowName: WORKFLOW_NAME,
};
