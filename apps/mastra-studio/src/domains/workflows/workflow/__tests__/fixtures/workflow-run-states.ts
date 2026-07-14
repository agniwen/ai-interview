import type { GetWorkflowRunByIdResponse } from "@mastra/client-js";

const AT = new Date(2026, 4, 29, 16, 19, 44).getTime();

function runState(
  runId: string,
  workflowName: string,
  overrides: Partial<GetWorkflowRunByIdResponse>,
): GetWorkflowRunByIdResponse {
  return {
    createdAt: new Date(AT),
    runId,
    status: "running",
    steps: {},
    updatedAt: new Date(AT),
    workflowName,
    ...overrides,
  };
}

// A run that suspended on its second step (transform). The provider converts this
// into a stream result with `result.steps.transform.status === 'suspended'`, which is
// what `useSuspendedSteps` reads.
export const suspendedRunState: GetWorkflowRunByIdResponse = runState(
  "run-suspended",
  "two-step-workflow",
  {
    payload: { request: true },
    status: "suspended",
    steps: {
      extract: {
        endedAt: AT,
        output: { customerId: "cus_123" },
        payload: { request: true },
        startedAt: AT,
        status: "success",
      },
      transform: {
        payload: { request: true },
        startedAt: AT,
        status: "suspended",
        suspendPayload: { question: "continue?" },
        suspendedAt: AT,
      },
    },
  },
);

// A fully successful run: nothing is suspended.
export const successfulRunState: GetWorkflowRunByIdResponse = runState(
  "run-success",
  "two-step-workflow",
  {
    payload: {},
    result: {},
    status: "success",
    steps: {
      extract: { endedAt: AT, output: {}, payload: {}, startedAt: AT, status: "success" },
      transform: { endedAt: AT, output: {}, payload: {}, startedAt: AT, status: "success" },
    },
  },
);

// A paused (per-step/debug) run with no completed steps yet.
export const pausedRunNoStepsState: GetWorkflowRunByIdResponse = runState(
  "run-paused-empty",
  "two-step-workflow",
  {
    payload: {},
    status: "paused",
    steps: {},
  },
);

// A paused run that completed the first step and is waiting on the next.
export const pausedRunAfterFirstStepState: GetWorkflowRunByIdResponse = runState(
  "run-paused-first",
  "two-step-workflow",
  {
    payload: {},
    status: "paused",
    steps: {
      extract: { endedAt: AT, output: {}, payload: {}, startedAt: AT, status: "success" },
    },
  },
);

// A paused run on the branch workflow that resolved the `long-text` arm, leaving the
// never-taken `short-text` arm without a result. The waited step must skip past it.
export const pausedRunBranchResolvedState: GetWorkflowRunByIdResponse = runState(
  "run-paused-branch",
  "branch-workflow",
  {
    payload: {},
    status: "paused",
    steps: {
      "long-text": { endedAt: AT, output: {}, payload: {}, startedAt: AT, status: "success" },
      start: { endedAt: AT, output: {}, payload: {}, startedAt: AT, status: "success" },
    },
  },
);

// A paused run on the parallel workflow where ONE parallel arm finished (`add-letter-b`
// success) while the sibling arm has NO output: it rehydrated as `skipped`. Because both
// `success` and `skipped` are treated as "resolved" for step selection, the waited step
// advances to the join (`mapping_join`) — but the join genuinely cannot run, since the
// `skipped` arm never produced an output to feed it. The "Run next step" control must
// therefore stay disabled: a partial join input (only the succeeded arm) is not runnable.
export const pausedRunMidParallelState: GetWorkflowRunByIdResponse = runState(
  "run-paused-mid-parallel",
  "parallel-workflow",
  {
    payload: {},
    status: "paused",
    steps: {
      "add-letter-b": {
        endedAt: AT,
        output: { value: "ab" },
        payload: {},
        startedAt: AT,
        status: "success",
      },
      "add-letter-c": { endedAt: AT, payload: {}, startedAt: AT, status: "skipped" },
      start: { endedAt: AT, output: { value: "a" }, payload: {}, startedAt: AT, status: "success" },
    },
  },
);

// A paused run on the parallel workflow where BOTH parallel arms finished. The join
// (`mapping_join`) now has all its predecessors and is runnable.
export const pausedRunParallelCompleteState: GetWorkflowRunByIdResponse = runState(
  "run-paused-parallel-complete",
  "parallel-workflow",
  {
    payload: {},
    status: "paused",
    steps: {
      "add-letter-b": {
        endedAt: AT,
        output: { value: "ab" },
        payload: {},
        startedAt: AT,
        status: "success",
      },
      "add-letter-c": {
        endedAt: AT,
        output: { value: "ac" },
        payload: {},
        startedAt: AT,
        status: "success",
      },
      start: { endedAt: AT, output: { value: "a" }, payload: {}, startedAt: AT, status: "success" },
    },
  },
);
