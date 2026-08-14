import { Txt } from "@mastra/playground-ui/components/Txt";
import type { WorkflowRunStreamResult } from "../context/workflow-run-context";
import { WorkflowStatus } from "./workflow-status";

interface StepResult {
  status: string;
  output?: unknown;
  suspendOutput?: unknown;
  error?: unknown;
  tripwire?: {
    reason?: string;
    retry?: boolean;
    metadata?: unknown;
    processorId?: string;
  };
  suspendPayload?: unknown;
}

export interface WorkflowStepsStatusProps {
  steps: Record<string, StepResult>;
  workflowResult?: WorkflowRunStreamResult | null;
}

export function WorkflowStepsStatus({ steps, workflowResult }: WorkflowStepsStatusProps) {
  const filteredSteps = Object.entries(steps).filter(
    ([key, _]) => key !== "input" && !key.endsWith(".input"),
  );

  if (filteredSteps.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-5 border-t border-border1">
      <Txt variant="ui-xs" className="text-neutral3">
        状态
      </Txt>
      <div className="flex flex-col gap-4">
        {filteredSteps.map(([stepId, step]) => {
          const { status } = step;
          let output;
          let suspendOutput;
          let error;

          if (step.status === "suspended") {
            ({ suspendOutput } = step);
          }
          if (step.status === "success") {
            ({ output } = step);
          }
          if (step.status === "failed") {
            ({ error } = step);
          }

          // Build tripwire info from step or workflow-level result
          // TripwireData is aligned with core schema: { reason, retry?, metadata?, processorId? }
          let tripwireInfo;
          if (step.status === "failed" && step.tripwire) {
            tripwireInfo = step.tripwire;
          } else if (workflowResult?.status === "tripwire") {
            tripwireInfo = {
              metadata: workflowResult.tripwire?.metadata,
              processorId: workflowResult.tripwire?.processorId,
              reason: workflowResult.tripwire?.reason,
              retry: workflowResult.tripwire?.retry,
            };
          }

          // Show tripwire status for failed steps with tripwire info
          const displayStatus = step.status === "failed" && step.tripwire ? "tripwire" : status;

          return (
            <WorkflowStatus
              key={stepId}
              stepId={stepId}
              status={displayStatus}
              result={(output ?? suspendOutput ?? error ?? {}) as Record<string, unknown>}
              tripwire={tripwireInfo}
            />
          );
        })}
      </div>
    </div>
  );
}
