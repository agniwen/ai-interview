import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";
import type { WorkflowRunStatus } from "@mastra/core/workflows";
import { useCurrentRun } from "../context/use-current-run";
import type { Step } from "../context/use-current-run";

import { Clock } from "./workflow-clock";
import { getNodeBadgeInfo } from "./workflow-node-badges";
import {
  WorkflowDefaultNodeBadges,
  WorkflowForeachProgress,
  WorkflowNodeStatusIcon,
} from "./workflow-node-parts";

import { WorkflowStepActionBar } from "./workflow-step-action-bar";

export type DefaultNode = Node<
  {
    label: string;
    stepId?: string;
    description?: string;
    withoutTopHandle?: boolean;
    withoutBottomHandle?: boolean;
    mapConfig?: string;
    duration?: number;
    date?: Date;
    isParallel?: boolean;
    canSuspend?: boolean;
    isForEach?: boolean;
    metadata?: Record<string, unknown>;
  },
  "default-node"
>;

export interface WorkflowDefaultNodeProps {
  parentWorkflowName?: string;
  stepsFlow: Record<string, string[]>;
}

function WorkflowDefaultNodeContent({
  date,
  description,
  displayStatus,
  duration,
  isForEachNode,
  label,
  mapConfig,
  step,
  stepId,
  stepKey,
  stepsFlow,
}: {
  date?: Date;
  description?: string;
  displayStatus?: string;
  duration?: number;
  isForEachNode: boolean;
  label: string;
  mapConfig?: string;
  step?: Step;
  stepId?: string;
  stepKey: string;
  stepsFlow: Record<string, string[]>;
}) {
  const isTripwire = displayStatus === "tripwire";
  return (
    <>
      <div className={cn("flex items-center gap-2 px-3", !description && "pb-2")}>
        <WorkflowNodeStatusIcon hasStep={Boolean(step)} status={displayStatus} />
        <Txt
          variant="ui-lg"
          className="text-neutral6 font-medium inline-flex items-center gap-1 justify-between w-full"
        >
          {label} {step?.startedAt && <Clock startedAt={step.startedAt} endedAt={step.endedAt} />}
        </Txt>
      </div>
      {description && (
        <Txt variant="ui-sm" className="text-neutral3 px-3 pb-2">
          {description}
        </Txt>
      )}
      {isForEachNode && step?.foreachProgress && (
        <WorkflowForeachProgress progress={step.foreachProgress} />
      )}
      {duration && (
        <Txt variant="ui-sm" className="text-neutral3 px-3 pb-2">
          休眠 <strong>{duration}ms</strong>
        </Txt>
      )}
      {date && (
        <Txt variant="ui-sm" className="text-neutral3 px-3 pb-2">
          休眠至 <strong>{new Date(date).toLocaleString("zh-CN")}</strong>
        </Txt>
      )}
      <WorkflowStepActionBar
        error={isTripwire ? undefined : step?.error}
        input={step?.input}
        mapConfig={mapConfig}
        output={step?.output}
        resumeData={step?.resumeData}
        status={displayStatus as WorkflowRunStatus}
        stepId={stepId}
        stepKey={stepKey}
        stepName={label}
        stepsFlow={stepsFlow}
        suspendOutput={step?.suspendOutput}
        tripwire={isTripwire ? step?.tripwire : undefined}
      />
    </>
  );
}

export function WorkflowDefaultNode({
  data,
  parentWorkflowName,
  stepsFlow,
}: NodeProps<DefaultNode> & WorkflowDefaultNodeProps) {
  const { steps } = useCurrentRun();
  const {
    label,
    stepId,
    description,
    withoutTopHandle,
    withoutBottomHandle,
    mapConfig,
    duration,
    date,
    isParallel,
    canSuspend,
    isForEach,
  } = data;

  const stepKey = parentWorkflowName ? `${parentWorkflowName}.${stepId || label}` : stepId || label;

  const step = steps[stepKey];

  // Check if this is a tripwire (failed step with tripwire property)
  const isTripwire = step?.status === "failed" && step?.tripwire !== undefined;
  const displayStatus = isTripwire ? "tripwire" : step?.status;

  const { isSleepNode, isForEachNode, isMapNode, hasSpecialBadge } = getNodeBadgeInfo({
    canSuspend,
    date,
    duration,
    isForEach,
    isParallel,
    mapConfig,
  });

  return (
    <>
      {!withoutTopHandle && (
        <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
      )}

      <div
        data-workflow-node
        data-workflow-step-status={displayStatus ?? "idle"}
        data-testid="workflow-default-node"
        className={cn(
          "bg-surface3 rounded-lg w-[274px] border border-border1",
          hasSpecialBadge ? "pt-0" : "pt-2",
          displayStatus === "success" && "bg-accent1Darker",
          displayStatus === "failed" && "bg-accent2Darker",
          displayStatus === "tripwire" && "bg-amber-950/40 border-amber-500/30",
          displayStatus === "suspended" && "bg-accent3Darker",
          displayStatus === "waiting" && "bg-accent5Darker",
          displayStatus === "running" && "bg-accent6Darker",
        )}
      >
        {hasSpecialBadge && (
          <WorkflowDefaultNodeBadges
            canSuspend={canSuspend}
            date={date}
            isForEachNode={isForEachNode}
            isMapNode={isMapNode}
            isParallel={isParallel}
            isSleepNode={isSleepNode}
          />
        )}
        <WorkflowDefaultNodeContent
          date={date}
          description={description}
          displayStatus={displayStatus}
          duration={duration}
          isForEachNode={isForEachNode}
          label={label}
          mapConfig={mapConfig}
          step={step}
          stepId={stepId}
          stepKey={stepKey}
          stepsFlow={stepsFlow}
        />
      </div>

      {!withoutBottomHandle && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ color: "red", visibility: "hidden" }}
        />
      )}
    </>
  );
}
