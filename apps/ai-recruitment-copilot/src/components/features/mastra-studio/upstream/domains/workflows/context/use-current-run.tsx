import type { WorkflowStepStatus } from "@mastra/core/workflows";
import { useContext } from "react";
import { WorkflowRunContext } from "./workflow-run-context";

/**
 * Tripwire data from workflow steps.
 * This matches the core TripwireData schema in packages/core/src/agent/trip-wire.ts
 */
export interface TripwireData {
  /** The reason for the tripwire */
  reason: string;
  /** If true, the agent should retry with the tripwire reason as feedback */
  retry?: boolean;
  /** Strongly typed metadata from the processor */
  metadata?: unknown;
  /** The ID of the processor that triggered the tripwire */
  processorId?: string;
}

export interface ForeachProgress {
  completedCount: number;
  totalCount: number;
  currentIndex: number;
  iterationStatus: "success" | "failed" | "suspended";
  iterationOutput?: unknown;
}

type StepStatus = Extract<
  WorkflowStepStatus,
  "running" | "success" | "failed" | "suspended" | "waiting" | "skipped"
>;

export interface Step {
  error?: unknown;
  tripwire?: TripwireData;
  startedAt: number;
  endedAt?: number;
  status: StepStatus;
  output?: unknown;
  input?: unknown;
  resumeData?: unknown;
  suspendOutput?: unknown;
  suspendPayload?: unknown;
  foreachProgress?: ForeachProgress;
  duration?: number;
  date?: Date;
  isForEach?: boolean;
  mapConfig?: string;
  canSuspend?: boolean;
  isParallel?: boolean;
  stepGraph?: unknown;
}

interface UseCurrentRunReturnType {
  steps: Record<string, Step>;
  runId?: string;
}

function readOptional<T>(value: Record<string, unknown>, key: string): T | undefined {
  return key in value ? (value[key] as T) : undefined;
}

function toCurrentStep(value: Record<string, unknown>): Step {
  const tripwire = readOptional<TripwireData>(value, "tripwire");
  const hasTripwire = value.status === "failed" && Boolean(tripwire);

  return {
    canSuspend: readOptional(value, "canSuspend"),
    date: readOptional(value, "date"),
    duration: readOptional(value, "duration"),
    endedAt: readOptional(value, "endedAt"),
    error: hasTripwire ? undefined : readOptional(value, "error"),
    foreachProgress: readOptional(value, "foreachProgress"),
    input: value.payload,
    isForEach: readOptional(value, "isForEach"),
    isParallel: readOptional(value, "isParallel"),
    mapConfig: readOptional(value, "mapConfig"),
    output: readOptional(value, "output"),
    resumeData: readOptional(value, "resumePayload"),
    startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now(),
    status: value.status as StepStatus,
    stepGraph: readOptional(value, "stepGraph"),
    suspendOutput: readOptional(value, "suspendOutput"),
    suspendPayload: readOptional(value, "suspendPayload"),
    tripwire: hasTripwire ? tripwire : undefined,
  };
}

export const useCurrentRun = (): UseCurrentRunReturnType => {
  const context = useContext(WorkflowRunContext);

  const workflowCurrentSteps = context.result?.steps ?? {};
  const steps: Record<string, Step> = {};
  for (const [key, value] of Object.entries(workflowCurrentSteps)) {
    steps[key] = toCurrentStep(value as Record<string, unknown>);
  }

  return { runId: context.runId, steps };
};
