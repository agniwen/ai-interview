import type { GetWorkflowResponse } from "@mastra/client-js";
import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";

import { useContext, useEffect } from "react";
import { BackgroundTaskMetadataDialogTrigger } from "./background-task-metadata-dialog";
import { BadgeWrapper } from "./badge-wrapper";
import { LoadingBadge } from "./loading-badge";
import { NetworkChoiceMetadataDialogTrigger } from "./network-choice-metadata-dialog";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { ToolApprovalButtons } from "./tool-approval-buttons";
import {
  WorkflowGraph,
  WorkflowRunContext,
  WorkflowRunProvider,
  WorkflowSelectedStepProvider,
  WorkflowStepDetailProvider,
} from "@/components/features/mastra-studio/upstream/domains/workflows";
import type { WorkflowRunStreamResult } from "@/components/features/mastra-studio/upstream/domains/workflows/context/workflow-run-context";
import { useWorkflowRuns } from "@/components/features/mastra-studio/upstream/hooks/use-workflow-runs";
import { useWorkflow } from "@/components/features/mastra-studio/upstream/hooks/use-workflows";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface WorkflowBadgeProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  workflowId: string;
  result?: WorkflowRunStreamResult & { runId?: string; status?: string };
  isStreaming?: boolean;
  metadata?: MessageMetadata;
  suspendPayload?: unknown;
  toolCalled?: boolean;
}

interface WorkflowBadgeExtendedProps {
  workflowId: string;
  runId?: string;
  workflow: GetWorkflowResponse;
}

const WorkflowBadgeExtended = ({ workflowId, workflow, runId }: WorkflowBadgeExtendedProps) => {
  const { Link } = useLinkComponent();

  return (
    <>
      <div className="flex items-center gap-2 pb-2">
        <Button as={Link} href={`/workflows/${workflowId}/graph`}>
          Go to workflow
        </Button>
        {runId && (
          <Button as={Link} href={`/workflows/${workflowId}/graph/${runId}`}>
            See run
          </Button>
        )}
      </div>

      <div className="rounded-md overflow-hidden h-[60vh] w-full">
        <WorkflowSelectedStepProvider>
          <WorkflowStepDetailProvider>
            <WorkflowGraph workflowId={workflowId} workflow={workflow} />
          </WorkflowStepDetailProvider>
        </WorkflowSelectedStepProvider>
      </div>
    </>
  );
};

const renderWorkflowExtraInfo = (metadata: MessageMetadata | undefined, toolCallId: string) => {
  if (metadata?.mode === "network") {
    const { routingDecision } = metadata;
    return (
      <NetworkChoiceMetadataDialogTrigger
        selectionReason={routingDecision?.selectionReason ?? metadata.selectionReason ?? ""}
        input={
          (routingDecision ?? metadata.agentInput) as string | Record<string, unknown> | undefined
        }
      />
    );
  }
  const backgroundTask = metadata?.backgroundTasks?.[toolCallId];
  return backgroundTask?.taskId && backgroundTask.startedAt ? (
    <BackgroundTaskMetadataDialogTrigger backgroundTask={backgroundTask} />
  ) : null;
};

export const WorkflowBadge = ({
  result,
  workflowId,
  isStreaming,
  metadata,
  toolCallId,
  toolApprovalMetadata,
  suspendPayload,
  toolName,
  isNetwork,
  toolCalled,
}: WorkflowBadgeProps) => {
  const { runId, status } = result || {};
  const { data: workflow, isLoading: isWorkflowLoading } = useWorkflow(workflowId);
  const { data: runs, isLoading: isRunsLoading } = useWorkflowRuns(workflowId, {
    enabled: Boolean(runId) && !isStreaming,
  });
  const selectedRun = runs?.find((candidateRun) => candidateRun.runId === runId);
  const isLoading = isRunsLoading || !selectedRun;

  const snapshot = typeof selectedRun?.snapshot === "object" ? selectedRun.snapshot : undefined;

  const suspendPayloadSlot =
    typeof suspendPayload === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {suspendPayload}
      </pre>
    ) : (
      <CodeEditor
        data={suspendPayload as Record<string, unknown> | Record<string, unknown>[] | undefined}
        data-testid="tool-suspend-payload"
      />
    );

  if (isWorkflowLoading || !workflow) {
    return <LoadingBadge />;
  }

  return (
    <BadgeWrapper
      data-testid="workflow-badge"
      icon={<WorkflowIcon className="text-accent3" />}
      title={workflow.name}
      initialCollapsed={false}
      extraInfo={renderWorkflowExtraInfo(metadata, toolCallId)}
    >
      {!isStreaming && !isLoading && (
        <WorkflowRunProvider
          snapshot={snapshot}
          workflowId={workflowId}
          initialRunId={runId}
          withoutTimeTravel
        >
          <WorkflowBadgeExtended workflowId={workflowId} workflow={workflow} runId={runId} />
        </WorkflowRunProvider>
      )}

      {isStreaming && (
        <WorkflowBadgeExtended workflowId={workflowId} workflow={workflow} runId={runId} />
      )}

      {suspendPayloadSlot !== undefined && Boolean(suspendPayload) && (
        <div>
          <p className="font-medium pb-2">Workflow suspend payload</p>
          {suspendPayloadSlot}
        </div>
      )}

      <ToolApprovalButtons
        toolCalled={toolCalled ?? !!status}
        toolCallId={toolCallId}
        toolApprovalMetadata={toolApprovalMetadata}
        toolName={toolName}
        isNetwork={isNetwork}
        isGenerateMode={metadata?.mode === "generate"}
      />
    </BadgeWrapper>
  );
};

export const useWorkflowStream = (workflowFullState?: WorkflowRunStreamResult) => {
  const { setResult } = useContext(WorkflowRunContext);

  useEffect(() => {
    if (!workflowFullState) {
      return;
    }
    setResult(workflowFullState);
  }, [workflowFullState, setResult]);
};
