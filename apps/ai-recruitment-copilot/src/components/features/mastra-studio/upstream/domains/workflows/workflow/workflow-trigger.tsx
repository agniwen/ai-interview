import type { GetWorkflowResponse } from "@mastra/client-js";
import type { WorkflowRunStatus } from "@mastra/core/workflows";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { toast } from "@mastra/playground-ui/utils/toast";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useContext, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { WorkflowRequestContextDialog } from "../components/workflow-request-context-dialog";
import { WorkflowRunOptionsDialog } from "../components/workflow-run-options-dialog";
import { WorkflowRunStatusIcon } from "../components/workflow-run-status-icon";
import type { WorkflowRunStreamResult } from "../context/workflow-run-context";
import { WorkflowRunContext } from "../context/workflow-run-context";
import { useSuspendedSteps, useWorkflowSchemas } from "./use-workflow-trigger";
import { WorkflowCancelButton } from "./workflow-cancel-button";
import { WorkflowDebugStepControls } from "./workflow-debug-step-controls";
import { WorkflowJsonDialog } from "./workflow-json-dialog";
import { WorkflowTriggerForm } from "./workflow-trigger-form";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

export interface WorkflowTriggerProps {
  workflowId: string;
  paramsRunId?: string;
  paramsRunStatus?: WorkflowRunStatus;
  setRunId?: (runId: string) => void;
  workflow?: GetWorkflowResponse;
  isLoading?: boolean;
  createWorkflowRun: ({
    workflowId,
    prevRunId,
  }: {
    workflowId: string;
    prevRunId?: string;
  }) => Promise<{
    runId: string;
  }>;
  isStreamingWorkflow: boolean;
  streamWorkflow: ({
    workflowId,
    runId,
    inputData,
    initialState,
    requestContext,
    perStep,
  }: {
    workflowId: string;
    runId: string;
    inputData: Record<string, unknown>;
    initialState?: Record<string, unknown>;
    requestContext: Record<string, unknown>;
    perStep?: boolean;
  }) => Promise<void>;
  observeWorkflowStream?: ({ workflowId, runId }: { workflowId: string; runId: string }) => void;
  resumeWorkflow: ({
    workflowId,
    step,
    runId,
    resumeData,
    requestContext,
    perStep,
  }: {
    workflowId: string;
    step: string | string[];
    runId: string;
    resumeData: Record<string, unknown>;
    requestContext: Record<string, unknown>;
    perStep?: boolean;
  }) => Promise<void>;
  streamResult: WorkflowRunStreamResult | null;
  isCancellingWorkflowRun: boolean;
  cancelWorkflowRun: ({ workflowId, runId }: { workflowId: string; runId: string }) => Promise<{
    message: string;
  }>;
}

function DebugModeSwitch() {
  const { debugMode, setDebugMode } = useContext(WorkflowRunContext);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Switch checked={debugMode} onCheckedChange={setDebugMode} aria-label="调试" />
      <Txt variant="ui-xs" className="text-neutral3 whitespace-nowrap">
        调试
      </Txt>
    </div>
  );
}

function useSyncStreamResultToWorkflowRunContext(streamResult: WorkflowRunStreamResult | null) {
  const { setResult } = useContext(WorkflowRunContext);

  useEffect(() => {
    if (streamResult) {
      setResult(streamResult);
    }
  }, [setResult, streamResult]);
}

function formatRunStatus(status?: WorkflowRunStatus) {
  if (!status) {
    return "运行";
  }
  const statusLabels: Partial<Record<WorkflowRunStatus, string>> = {
    canceled: "已取消",
    failed: "失败",
    pending: "等待中",
    running: "运行中",
    success: "成功",
    suspended: "已挂起",
    waiting: "等待中",
  };
  return statusLabels[status] ?? status;
}

function formatRunDuration(durationMs?: number) {
  if (durationMs === undefined) {
    return "—";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${Number(seconds.toPrecision(3))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function formatRelativeTime(ms?: number) {
  if (!ms || ms <= 0) {
    return "—";
  }
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const seconds = Math.floor(abs / 1000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  if (seconds < 60) {
    return formatter.format(diff >= 0 ? seconds : -seconds, "second");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return formatter.format(diff >= 0 ? minutes : -minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatter.format(diff >= 0 ? hours : -hours, "hour");
  }
  const days = Math.floor(hours / 24);
  return formatter.format(diff >= 0 ? days : -days, "day");
}

function getRunDuration(result: WorkflowRunStreamResult | null, status?: WorkflowRunStatus) {
  const stepTimes: { startedAt: number; endedAt?: number }[] = Object.values(
    result?.steps ?? {},
  ).flatMap((step) => {
    const startedAt = "startedAt" in step ? step.startedAt : undefined;
    if (typeof startedAt !== "number") {
      return [];
    }
    const endedAt = "endedAt" in step ? step.endedAt : undefined;
    return [{ startedAt, ...(typeof endedAt === "number" ? { endedAt } : {}) }];
  });

  if (stepTimes.length === 0) {
    return;
  }

  const startedAt = Math.min(...stepTimes.map((step) => step.startedAt));
  const endedTimes = stepTimes.flatMap((step) => (step.endedAt ? [step.endedAt] : []));
  const endedAt = endedTimes.length > 0 ? Math.max(...endedTimes) : undefined;
  const isActive = status === "running" || status === "suspended" || status === "waiting";
  const effectiveEndedAt = endedAt ?? (isActive ? Date.now() : undefined);
  return effectiveEndedAt === undefined ? undefined : effectiveEndedAt - startedAt;
}

function InitialWorkflowHeader({
  workflow,
  workflowId,
}: {
  workflow: GetWorkflowResponse;
  workflowId: string;
}) {
  const stepsCount = Object.keys(workflow.steps ?? {}).length;

  return (
    <div className="flex w-full items-center gap-2 px-5">
      <Icon className="shrink-0 text-neutral4">
        <WorkflowIcon />
      </Icon>
      <Txt as="span" variant="ui-md" className="text-neutral5 font-semibold truncate">
        {workflow.name ?? workflowId}
      </Txt>
      <CopyButton content={workflow.name ?? workflowId} variant="ghost" className="shrink-0" />
      <Badge className="ml-auto shrink-0">{stepsCount} 个步骤</Badge>
    </div>
  );
}

function RunWorkflowHeader({
  runId,
  status,
  result,
  timestamp,
}: {
  runId: string;
  status?: WorkflowRunStatus;
  result: WorkflowRunStreamResult | null;
  timestamp?: number;
}) {
  const runDuration = getRunDuration(result, status);

  return (
    <div className="flex w-full items-start gap-3 px-5">
      {status && (
        <span className="shrink-0 pt-1">
          <WorkflowRunStatusIcon status={status} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Txt as="span" variant="ui-md" className="block truncate font-semibold text-neutral5">
          {formatRunStatus(status)}
        </Txt>
        <Txt as="span" variant="ui-xs" className="block truncate text-neutral3" title={runId}>
          {runId}
        </Txt>
      </div>
      <div className="shrink-0 text-right">
        <Txt as="span" variant="ui-xs" className="block font-medium text-neutral5">
          {formatRunDuration(runDuration)}
        </Txt>
        <Txt as="span" variant="ui-xs" className="block text-neutral3">
          {formatRelativeTime(timestamp)}
        </Txt>
      </div>
    </div>
  );
}

function WorkflowTriggerFormSection({
  canExecute,
  formProps,
  requestContextSchema,
}: {
  canExecute: boolean;
  formProps: ComponentProps<typeof WorkflowTriggerForm>;
  requestContextSchema?: string;
}) {
  if (!canExecute) {
    return (
      <Txt variant="ui-sm" className="text-neutral3 py-2 px-5">
        你没有执行工作流的权限。
      </Txt>
    );
  }
  return (
    <WorkflowTriggerForm
      {...formProps}
      submitActions={
        <>
          {requestContextSchema && (
            <WorkflowRequestContextDialog requestContextSchema={requestContextSchema} />
          )}
          <WorkflowRunOptionsDialog />
        </>
      }
    />
  );
}

function WorkflowRunResultActions({
  hasFinished,
  result,
}: {
  hasFinished: boolean;
  result: WorkflowRunStreamResult | null;
}) {
  if (!hasFinished || !result) {
    return null;
  }
  return (
    <div className="px-5 pb-4">
      <div className="flex flex-col gap-1">
        <WorkflowJsonDialog
          className="w-full justify-start"
          variant="ghost"
          size="sm"
          data={result}
          triggerLabel="完整工作流执行（JSON）"
          title="完整工作流执行（JSON）"
        />
        {"result" in result && result.result !== undefined && (
          <WorkflowJsonDialog
            className="w-full justify-start"
            variant="ghost"
            size="sm"
            data={{ result: result.result }}
            triggerLabel="运行输出"
            title="运行输出（JSON）"
          />
        )}
      </div>
    </div>
  );
}

function WorkflowTriggerBody({
  cancelProps,
  formSection,
  isPausedDebug,
  isStreaming,
  resultActions,
  showCancelAction,
  showResumeNotice,
}: {
  cancelProps: ComponentProps<typeof WorkflowCancelButton>;
  formSection: ReactNode;
  isPausedDebug: boolean;
  isStreaming: boolean;
  resultActions: ReactNode;
  showCancelAction: boolean;
  showResumeNotice: boolean;
}) {
  return (
    <div className="h-full pt-3 overflow-y-auto">
      <div className="border-b border-border1/50">
        {showResumeNotice && (
          <div className="py-2 px-5 flex items-center gap-2 bg-surface5 -mt-5 border-b border-border1">
            <Icon>
              <Loader2 className="animate-spin text-neutral6" />
            </Icon>
            <Txt>正在恢复工作流</Txt>
          </div>
        )}
        {formSection}
        {resultActions}
        {isPausedDebug && (
          <div className="px-5 pb-4 pt-3">
            <WorkflowDebugStepControls isStreaming={isStreaming} />
          </div>
        )}
        {showCancelAction && (
          <div data-testid="workflow-cancel-action" className="px-5 pb-4 pt-3">
            <WorkflowCancelButton {...cancelProps} />
          </div>
        )}
      </div>
    </div>
  );
}

function getTriggerViewFlags({
  hasFinished,
  isPausedDebug,
  isStreamingWorkflow,
  isSuspendedSteps,
  paramsRunId,
  status,
}: {
  hasFinished: boolean;
  isPausedDebug: boolean;
  isStreamingWorkflow: boolean;
  isSuspendedSteps: boolean;
  paramsRunId?: string;
  status?: WorkflowRunStatus;
}) {
  return {
    cancelStatus: isSuspendedSteps ? "suspended" : status,
    isReadOnly: Boolean(paramsRunId || hasFinished || isSuspendedSteps || isPausedDebug),
    isStreaming: isStreamingWorkflow || isSuspendedSteps,
    isViewingRun: Boolean(paramsRunId || hasFinished || isPausedDebug),
    showCancelAction: Boolean(status === "running" || isSuspendedSteps || isPausedDebug),
    showResumeNotice: isSuspendedSteps && isStreamingWorkflow,
  } as const;
}

function WorkflowHeading({
  activeRunId,
  paramsRunStatus,
  result,
  runSnapshot,
  workflow,
  workflowId,
}: {
  activeRunId?: string;
  paramsRunStatus?: WorkflowRunStatus;
  result: WorkflowRunStreamResult | null;
  runSnapshot?: { timestamp?: number };
  workflow: GetWorkflowResponse;
  workflowId: string;
}) {
  if (!activeRunId) {
    return <InitialWorkflowHeader workflow={workflow} workflowId={workflowId} />;
  }
  return (
    <RunWorkflowHeader
      runId={activeRunId}
      status={result?.status ?? paramsRunStatus}
      result={result}
      timestamp={runSnapshot?.timestamp}
    />
  );
}

export function WorkflowTrigger({
  workflowId,
  paramsRunId,
  paramsRunStatus,
  setRunId,
  workflow,
  isLoading,
  createWorkflowRun,
  streamWorkflow,
  observeWorkflowStream,
  isStreamingWorkflow,
  streamResult,
  isCancellingWorkflowRun,
  cancelWorkflowRun,
}: WorkflowTriggerProps) {
  const requestContext = useMergedRequestContext();

  const {
    result,
    setResult,
    payload,
    setPayload,
    setRunId: setContextRunId,
    runId: contextRunId,
    runSnapshot,
  } = useContext(WorkflowRunContext);
  useSyncStreamResultToWorkflowRunContext(streamResult);
  const { canExecute } = usePermissions();

  // Check if user can execute workflows
  const canExecuteWorkflow = canExecute("workflows");

  const [innerRunId, setInnerRunId] = useState<string>("");
  const [cancelResponse, setCancelResponse] = useState<{ message: string } | null>(null);
  const observedParamRunRef = useRef<string | null>(null);

  const activeRunId = paramsRunId || contextRunId;
  const streamResultToUse = activeRunId ? (result ?? streamResult) : null;
  const suspendedSteps = useSuspendedSteps(streamResultToUse, innerRunId);
  const { zodSchemaToUse, hasStateSchema } = useWorkflowSchemas(workflow);

  const hasFinished = ["success", "failed", "canceled", "bailed"].includes(
    streamResultToUse?.status ?? "",
  );
  // A run only reaches the 'paused' status when it was started in per-step (debug) mode, so a
  // paused run always exposes the step controls — including when viewing a paused run directly
  // on its :runId page, where the in-memory debugMode flag starts out false.
  const isPausedDebug = streamResultToUse?.status === "paused";

  const handleExecuteWorkflow = async (data: unknown) => {
    try {
      if (!workflow) {
        return;
      }

      setCancelResponse(null);
      setResult(null);

      const run = await createWorkflowRun({ workflowId });

      setRunId?.(run.runId);
      setInnerRunId(run.runId);
      setContextRunId(run.runId);

      const submittedData =
        data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const initialState = submittedData.initialState as Record<string, unknown> | undefined;
      const inputData = (hasStateSchema ? submittedData.inputData : submittedData) as Record<
        string,
        unknown
      >;

      void streamWorkflow({
        initialState,
        inputData,
        requestContext,
        runId: run.runId,
        workflowId,
      });
    } catch {
      toast.error("执行工作流时出错");
    }
  };

  const handleCancelWorkflowRun = async () => {
    try {
      const response = await cancelWorkflowRun({ runId: innerRunId, workflowId });
      setCancelResponse(response);
    } catch {
      toast.error("取消工作流运行时出错");
    }
  };

  useEffect(() => {
    if (!paramsRunId || !observeWorkflowStream) {
      return;
    }

    const observedParamRunKey = `${workflowId}:${paramsRunId}`;
    if (observedParamRunRef.current !== observedParamRunKey) {
      observeWorkflowStream({ runId: paramsRunId, workflowId });
      observedParamRunRef.current = observedParamRunKey;
    }

    setInnerRunId(paramsRunId);
    setContextRunId(paramsRunId);
  }, [paramsRunId, observeWorkflowStream, setContextRunId, workflowId]);

  useEffect(() => {
    if (!paramsRunId && !contextRunId) {
      setInnerRunId("");
    }
  }, [contextRunId, paramsRunId]);

  if (isLoading) {
    return (
      <ScrollArea className="h-[calc(100vh-126px)] pt-2 px-4 pb-4 text-xs">
        <div className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </ScrollArea>
    );
  }

  if (!workflow) {
    return null;
  }

  const isSuspendedSteps = suspendedSteps.length > 0;

  const headingSlot = (
    <WorkflowHeading
      activeRunId={activeRunId}
      paramsRunStatus={paramsRunStatus}
      result={streamResultToUse}
      runSnapshot={runSnapshot}
      workflow={workflow}
      workflowId={workflowId}
    />
  );
  const viewFlags = getTriggerViewFlags({
    hasFinished,
    isPausedDebug,
    isStreamingWorkflow,
    isSuspendedSteps,
    paramsRunId,
    status: streamResultToUse?.status,
  });

  const formSection = (
    <WorkflowTriggerFormSection
      canExecute={canExecuteWorkflow}
      requestContextSchema={
        typeof workflow.requestContextSchema === "string"
          ? workflow.requestContextSchema
          : undefined
      }
      formProps={{
        collapsible: false,
        defaultValues: payload,
        disableSubmit: isSuspendedSteps,
        headingSlot,
        isProcessorWorkflow: workflow.isProcessorWorkflow,
        isReadOnly: viewFlags.isReadOnly,
        isStreaming: viewFlags.isStreaming,
        isViewingRun: viewFlags.isViewingRun,
        leftActions: paramsRunId ? undefined : <DebugModeSwitch />,
        onExecute: (data) => {
          setPayload(data);
          void handleExecuteWorkflow(data);
        },
        zodSchema: zodSchemaToUse,
      }}
    />
  );
  return (
    <WorkflowTriggerBody
      cancelProps={{
        cancelMessage: cancelResponse?.message ?? null,
        disabled: isSuspendedSteps,
        isCancelling: isCancellingWorkflowRun,
        onCancel: handleCancelWorkflowRun,
        status: viewFlags.cancelStatus,
      }}
      formSection={formSection}
      isPausedDebug={isPausedDebug}
      isStreaming={isStreamingWorkflow}
      resultActions={<WorkflowRunResultActions hasFinished={hasFinished} result={result} />}
      showCancelAction={viewFlags.showCancelAction}
      showResumeNotice={viewFlags.showResumeNotice}
    />
  );
}
