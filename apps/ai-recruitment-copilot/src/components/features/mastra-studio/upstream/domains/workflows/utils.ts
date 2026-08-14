import type { WorkflowRunState, StepResult } from "@mastra/core/workflows";

import type { WorkflowRunStreamResult } from "./context/workflow-run-context";

type WorkflowStepResult = StepResult<unknown, unknown, unknown, unknown>;

const convertStepResult = (result: WorkflowStepResult): Record<string, unknown> => {
  const hasTripwire = result.status === "failed" && result.tripwire !== undefined;
  const stepError = hasTripwire || !("error" in result) ? undefined : result.error;

  return {
    endedAt: "endedAt" in result ? result.endedAt : undefined,
    error: stepError,
    output: "output" in result ? result.output : undefined,
    payload: "payload" in result ? result.payload : undefined,
    resumePayload: "resumePayload" in result ? result.resumePayload : undefined,
    resumedAt: "resumedAt" in result ? result.resumedAt : undefined,
    startedAt: "startedAt" in result ? result.startedAt : Date.now(),
    status: result.status,
    suspendOutput: "suspendOutput" in result ? result.suspendOutput : undefined,
    suspendPayload: "suspendPayload" in result ? result.suspendPayload : undefined,
    suspendedAt: "suspendedAt" in result ? result.suspendedAt : undefined,
    tripwire: hasTripwire ? result.tripwire : undefined,
  };
};

const getSuspendedStepIds = (steps: Record<string, Record<string, unknown>>): string[][] => {
  const suspendedStepIds: string[][] = [];

  for (const [stepId, stepResult] of Object.entries(steps)) {
    if (stepResult.status !== "suspended") {
      continue;
    }

    const nestedPath = (
      stepResult.suspendPayload as { __workflow_meta?: { path?: string[] } } | undefined
    )?.__workflow_meta?.path;
    suspendedStepIds.push(nestedPath ? [stepId, ...nestedPath] : [stepId]);
  }

  return suspendedStepIds;
};

const getTripwireResult = (runState: WorkflowRunState) => {
  if (runState.status !== "tripwire" || !runState.tripwire) {
    return {};
  }

  return {
    tripwire: {
      metadata: runState.tripwire.metadata,
      processorId: runState.tripwire.processorId,
      reason: runState.tripwire.reason,
      retry: runState.tripwire.retry,
    },
  };
};

export function convertWorkflowRunStateToStreamResult(
  runState: WorkflowRunState,
): WorkflowRunStreamResult {
  const steps: Record<string, Record<string, unknown>> = {};
  const context = runState.context || {};

  for (const [stepId, stepResult] of Object.entries(context)) {
    if (stepId !== "input" && "status" in stepResult) {
      steps[stepId] = convertStepResult(stepResult as WorkflowStepResult);
    }
  }

  const suspendedStepIds = getSuspendedStepIds(steps);
  const suspendedStep = suspendedStepIds[0]?.[0];
  const suspendPayload = suspendedStep ? steps[suspendedStep]?.suspendPayload : undefined;

  return {
    input: context.input,
    status: runState.status,
    steps,
    ...(runState.status === "success" ? { result: runState.result } : {}),
    ...(runState.status === "failed" ? { error: runState.error } : {}),
    ...(runState.status === "suspended" ? { suspendPayload, suspended: suspendedStepIds } : {}),
    ...getTripwireResult(runState),
  } as WorkflowRunStreamResult;
}
