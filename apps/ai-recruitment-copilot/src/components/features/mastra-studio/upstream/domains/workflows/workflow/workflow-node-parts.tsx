import { Badge } from "@mastra/playground-ui/components/Badge";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { CheckIcon } from "@mastra/playground-ui/icons/CheckIcon";
import { CrossIcon } from "@mastra/playground-ui/icons/CrossIcon";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { CircleDashed, HourglassIcon, Loader2, PauseIcon, ShieldAlert } from "lucide-react";

import type { ForeachProgress } from "../context/use-current-run";
import { BADGE_COLORS, BADGE_ICONS } from "./workflow-node-badges";

export function WorkflowNodeStatusIcon({ hasStep, status }: { hasStep: boolean; status?: string }) {
  return (
    <Icon>
      {status === "failed" && <CrossIcon className="text-accent2" />}
      {status === "success" && <CheckIcon className="text-accent1" />}
      {status === "tripwire" && <ShieldAlert className="text-amber-400" />}
      {status === "suspended" && <PauseIcon className="text-accent3" />}
      {status === "waiting" && <HourglassIcon className="text-accent5" />}
      {status === "running" && <Loader2 className="text-accent6 animate-spin" />}
      {!hasStep && <CircleDashed className="text-neutral2" />}
    </Icon>
  );
}

export function WorkflowForeachProgress({ progress }: { progress: ForeachProgress }) {
  const percentage =
    progress.totalCount > 0 ? (progress.completedCount / progress.totalCount) * 100 : 0;
  return (
    <div className="px-3 pb-2 flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface1 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            progress.iterationStatus === "failed" ? "bg-accent2" : "bg-accent1",
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <Txt variant="ui-xs" className="text-neutral3 whitespace-nowrap">
        {progress.completedCount} / {progress.totalCount}
      </Txt>
    </div>
  );
}

function NodeBadge({ type, children }: { type: keyof typeof BADGE_ICONS; children: string }) {
  const BadgeIcon = BADGE_ICONS[type];
  const color = BADGE_COLORS[type === "sleepUntil" ? "sleep" : type];
  return <Badge icon={<BadgeIcon className="text-current" style={{ color }} />}>{children}</Badge>;
}

export function WorkflowDefaultNodeBadges({
  canSuspend,
  date,
  isForEachNode,
  isMapNode,
  isParallel,
  isSleepNode,
}: {
  canSuspend?: boolean;
  date?: Date;
  isForEachNode: boolean;
  isMapNode: boolean;
  isParallel?: boolean;
  isSleepNode: boolean;
}) {
  return (
    <div className="px-3 pt-2 pb-1 flex gap-1.5 flex-wrap">
      {isSleepNode && (
        <NodeBadge type={date ? "sleepUntil" : "sleep"}>{date ? "SLEEP UNTIL" : "SLEEP"}</NodeBadge>
      )}
      {canSuspend && <NodeBadge type="suspend">SUSPEND/RESUME</NodeBadge>}
      {isParallel && <NodeBadge type="parallel">PARALLEL</NodeBadge>}
      {isForEachNode && <NodeBadge type="forEach">FOREACH</NodeBadge>}
      {isMapNode && <NodeBadge type="map">MAP</NodeBadge>}
    </div>
  );
}

export function WorkflowNestedNodeBadges({
  canSuspend,
  isForEachNode,
  isMapNode,
  isNestedWorkflow,
  isParallel,
}: {
  canSuspend?: boolean;
  isForEachNode: boolean;
  isMapNode: boolean;
  isNestedWorkflow: boolean;
  isParallel?: boolean;
}) {
  return (
    <div className="px-3 pt-2 pb-1 flex gap-1.5 flex-wrap">
      {canSuspend && <NodeBadge type="suspend">SUSPEND/RESUME</NodeBadge>}
      {isParallel && <NodeBadge type="parallel">PARALLEL</NodeBadge>}
      {isNestedWorkflow && <NodeBadge type="workflow">WORKFLOW</NodeBadge>}
      {isForEachNode && <NodeBadge type="forEach">FOREACH</NodeBadge>}
      {isMapNode && <NodeBadge type="map">MAP</NodeBadge>}
    </div>
  );
}
