import type { SerializedStepFlowEntry } from "@mastra/core/workflows";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { cn } from "@mastra/playground-ui/utils/cn";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps, Node } from "@xyflow/react";

import { useCurrentRun } from "../context/use-current-run";
import type { Step } from "../context/use-current-run";
import { useWorkflowStepDetail } from "../context/workflow-step-detail-context";
import { Clock } from "./workflow-clock";
import { getNodeBadgeInfo } from "./workflow-node-badges";
import {
  WorkflowForeachProgress,
  WorkflowNestedNodeBadges,
  WorkflowNodeStatusIcon,
} from "./workflow-node-parts";
import { WorkflowStepActionBar } from "./workflow-step-action-bar";

export type NestedNode = Node<
  {
    label: string;
    stepId?: string;
    description?: string;
    withoutTopHandle?: boolean;
    withoutBottomHandle?: boolean;
    stepGraph: SerializedStepFlowEntry[];
    mapConfig?: string;
    isParallel?: boolean;
    canSuspend?: boolean;
    isForEach?: boolean;
    metadata?: Record<string, unknown>;
  },
  "nested-node"
>;

export interface WorkflowNestedNodeProps {
  parentWorkflowName?: string;
  stepsFlow: Record<string, string[]>;
}

function WorkflowNestedNodeContent({
  description,
  displayStatus,
  fullLabel,
  isForEachNode,
  label,
  mapConfig,
  showNestedGraph,
  step,
  stepGraph,
  stepId,
  stepKey,
  stepsFlow,
}: {
  description?: string;
  displayStatus?: string;
  fullLabel: string;
  isForEachNode: boolean;
  label: string;
  mapConfig?: string;
  showNestedGraph: (data: {
    fullStep: string;
    label: string;
    stepGraph: SerializedStepFlowEntry[];
  }) => void;
  step?: Step;
  stepGraph: SerializedStepFlowEntry[];
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
      <WorkflowStepActionBar
        error={step?.error}
        input={step?.input}
        mapConfig={mapConfig}
        onShowNestedGraph={() => showNestedGraph({ fullStep: fullLabel, label, stepGraph })}
        output={step?.output}
        resumeData={step?.resumeData}
        status={displayStatus as never}
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

export function WorkflowNestedNode({
  data,
  parentWorkflowName,
  stepsFlow,
}: NodeProps<NestedNode> & WorkflowNestedNodeProps) {
  const { steps } = useCurrentRun();
  const { showNestedGraph } = useWorkflowStepDetail();

  const {
    label,
    stepId,
    description,
    withoutTopHandle,
    withoutBottomHandle,
    stepGraph,
    mapConfig,
    isParallel,
    canSuspend,
    isForEach,
  } = data;

  const fullLabel = parentWorkflowName ? `${parentWorkflowName}.${label}` : label;
  const stepKey = parentWorkflowName ? `${parentWorkflowName}.${stepId || label}` : stepId || label;

  const step = steps[stepKey];

  // Check if this is a tripwire (failed step with tripwire property)
  const isTripwire = step?.status === "failed" && step?.tripwire !== undefined;
  const displayStatus = isTripwire ? "tripwire" : step?.status;

  const { isForEachNode, isMapNode, isNestedWorkflow, hasSpecialBadge } = getNodeBadgeInfo({
    canSuspend,
    isForEach,
    isParallel,
    mapConfig,
    stepGraph,
  });

  return (
    <>
      {!withoutTopHandle && (
        <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />
      )}
      <div
        data-testid="workflow-nested-node"
        data-workflow-node
        data-workflow-step-status={displayStatus}
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
          <WorkflowNestedNodeBadges
            canSuspend={canSuspend}
            isForEachNode={isForEachNode}
            isMapNode={isMapNode}
            isNestedWorkflow={isNestedWorkflow}
            isParallel={isParallel}
          />
        )}
        <WorkflowNestedNodeContent
          description={description}
          displayStatus={displayStatus}
          fullLabel={fullLabel}
          isForEachNode={isForEachNode}
          label={label}
          mapConfig={mapConfig}
          showNestedGraph={showNestedGraph}
          step={step}
          stepGraph={stepGraph}
          stepId={stepId}
          stepKey={stepKey}
          stepsFlow={stepsFlow}
        />
      </div>
      {!withoutBottomHandle && (
        <Handle type="source" position={Position.Bottom} style={{ visibility: "hidden" }} />
      )}
    </>
  );
}
