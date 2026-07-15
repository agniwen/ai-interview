import type { GetWorkflowResponse } from "@mastra/client-js";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useParams } from "@/components/features/mastra-studio/router/compat";
import { WorkflowStepDetailContent } from "@/components/features/mastra-studio/upstream/domains/workflows/components/workflow-step-detail";
import { useWorkflowStepDetail } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-step-detail-context";
import { WorkflowStepDetailProvider } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-step-detail-provider";
import { WorkflowGraph } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow/workflow-graph";
import { WorkflowSuspendedOverlay } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow/workflow-suspended-overlay";
import { WorkflowTimeline } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow/workflow-timeline";
import { useWorkflow } from "@/components/features/mastra-studio/upstream/hooks/use-workflows";

interface WorkflowContentProps {
  workflowId: string;
  workflow?: GetWorkflowResponse;
  isLoading: boolean;
}

const WorkflowContent = ({ workflowId, workflow, isLoading }: WorkflowContentProps) => {
  const { stepDetail } = useWorkflowStepDetail();

  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 p-2 pb-0">
          <WorkflowGraph workflowId={workflowId} workflow={workflow} isLoading={isLoading} />
          <WorkflowSuspendedOverlay />
          <WorkflowTimeline />
        </div>
      </div>
      {stepDetail && (
        <div className="w-[420px] min-h-0 overflow-hidden border-l border-border1">
          <WorkflowStepDetailContent />
        </div>
      )}
    </div>
  );
};

export const Workflow = () => {
  const { workflowId } = useParams();
  const resolvedWorkflowId = workflowId ?? "";
  const { data: workflow, isLoading, error } = useWorkflow(resolvedWorkflowId);

  // 401 check - session expired, needs re-authentication
  if (error && is401UnauthorizedError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <SessionExpired />
      </div>
    );
  }

  // 403 check - permission denied for workflows
  if (error && is403ForbiddenError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <PermissionDenied resource="工作流" />
      </div>
    );
  }

  return (
    <WorkflowStepDetailProvider>
      <WorkflowContent
        workflowId={resolvedWorkflowId}
        workflow={workflow ?? undefined}
        isLoading={isLoading}
      />
    </WorkflowStepDetailProvider>
  );
};
