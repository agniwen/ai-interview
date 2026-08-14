import type { WorkflowRunStatus } from "@mastra/core/workflows";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Check, CirclePause, CircleSlash, Clock, X } from "lucide-react";

export interface WorkflowRunStatusIconProps {
  status: WorkflowRunStatus;
}

const STATUS_LABELS: Partial<Record<WorkflowRunStatus, string>> = {
  canceled: "已取消",
  failed: "失败",
  pending: "等待中",
  running: "运行中",
  success: "成功",
  suspended: "已挂起",
  waiting: "等待中",
};

function StatusIcon({ status }: WorkflowRunStatusIconProps) {
  switch (status) {
    case "running": {
      return <Spinner />;
    }
    case "failed": {
      return <X className="text-accent2" />;
    }
    case "canceled": {
      return <CircleSlash className="text-neutral3" />;
    }
    case "pending":
    case "waiting": {
      return <Clock className="text-neutral3" />;
    }
    case "suspended": {
      return <CirclePause className="text-accent3" />;
    }
    case "success": {
      return <Check className="text-accent1" />;
    }
    default: {
      return <Clock className="text-neutral3" />;
    }
  }
}

export function WorkflowRunStatusIcon({ status }: WorkflowRunStatusIconProps) {
  const statusLabel = STATUS_LABELS[status] ?? status;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon aria-label={statusLabel} className="shrink-0">
          <StatusIcon status={status} />
        </Icon>
      </TooltipTrigger>
      <TooltipContent>{statusLabel}</TooltipContent>
    </Tooltip>
  );
}
