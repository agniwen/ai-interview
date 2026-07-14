import type { WorkflowRunState } from "@mastra/core/workflows";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { useParams } from "@/components/features/mastra-studio/router/compat";
import { WorkflowHeader } from "./workflow-header";
import { TracingSettingsProvider } from "@/components/features/mastra-studio/upstream/domains/observability/context/tracing-settings-context";
import { SchemaRequestContextProvider } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";
import { WorkflowInformation } from "@/components/features/mastra-studio/upstream/domains/workflows/components/workflow-information";
import { WorkflowLayout as WorkflowLayoutUI } from "@/components/features/mastra-studio/upstream/domains/workflows/components/workflow-layout";
import { WorkflowRunProvider } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-run-provider";
import { WorkflowSelectedStepProvider } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-selected-step-context";
import { WorkflowStepDetailProvider } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-step-detail-provider";
import { useWorkflowRun } from "@/components/features/mastra-studio/upstream/hooks/use-workflow-runs";
import { useWorkflow } from "@/components/features/mastra-studio/upstream/hooks/use-workflows";

export const WorkflowLayout = ({ children }: { children: React.ReactNode }) => {
  const { workflowId, runId } = useParams();
  const { data: workflow, isLoading: isWorkflowLoading } = useWorkflow(workflowId);
  const { data: runExecutionResult, isLoading: isRunLoading } = useWorkflowRun(
    workflowId ?? "",
    runId ?? "",
  );

  if (!workflowId) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Txt variant="ui-md" className="text-neutral6 text-center">
          No workflow ID provided
        </Txt>
      </div>
    );
  }

  if (isWorkflowLoading || (Boolean(runId) && isRunLoading)) {
    return (
      <div className="h-full p-4">
        <Skeleton className="h-full" />
      </div>
    );
  }

  const snapshot =
    runExecutionResult && runId
      ? ({
          context: {
            input: runExecutionResult?.payload,
            ...runExecutionResult?.steps,
          },
          error: runExecutionResult?.error,
          result: runExecutionResult?.result,
          runId,
          serializedStepGraph: runExecutionResult?.serializedStepGraph,
          status: runExecutionResult?.status,
        } as WorkflowRunState)
      : undefined;

  return (
    <TracingSettingsProvider entityId={workflowId} entityType="workflow">
      <SchemaRequestContextProvider>
        <WorkflowRunProvider snapshot={snapshot} workflowId={workflowId} initialRunId={runId}>
          <WorkflowSelectedStepProvider>
            <WorkflowStepDetailProvider>
              <div className="h-full min-h-0">
                <WorkflowHeader workflowName={workflow?.name || ""} workflowId={workflowId} />
                <WorkflowLayoutUI
                  workflowId={workflowId!}
                  leftSlot={<WorkflowInformation workflowId={workflowId} initialRunId={runId} />}
                >
                  {children}
                </WorkflowLayoutUI>
              </div>
            </WorkflowStepDetailProvider>
          </WorkflowSelectedStepProvider>
        </WorkflowRunProvider>
      </SchemaRequestContextProvider>
    </TracingSettingsProvider>
  );
};
