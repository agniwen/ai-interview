import type { WorkflowRunStatus } from "@mastra/core/workflows";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Check, CirclePause, CircleSlash, Clock, X } from "lucide-react";

export interface WorkflowRunStatusInlineProps {
  status: WorkflowRunStatus;
}

function getStatusVisual(status: WorkflowRunStatus): { icon: React.ReactNode; color: string } {
  switch (status) {
    case "success": {
      return { color: "text-accent1", icon: <Check size={14} /> };
    }
    case "failed": {
      return { color: "text-accent2", icon: <X size={14} /> };
    }
    case "running": {
      return { color: "text-neutral3", icon: <Spinner /> };
    }
    case "suspended": {
      return { color: "text-accent3", icon: <CirclePause size={14} /> };
    }
    case "canceled": {
      return { color: "text-neutral3", icon: <CircleSlash size={14} /> };
    }
    case "pending":
    case "waiting": {
      return { color: "text-neutral3", icon: <Clock size={14} /> };
    }
    default: {
      return { color: "text-neutral3", icon: null };
    }
  }
}

/**
 * Compact inline run status — icon + colored label, no chip background.
 * Used in dense schedule rows + trigger history rows where filled badges
 * compete with surrounding text.
 */
export function WorkflowRunStatusInline({ status }: WorkflowRunStatusInlineProps) {
  const { icon, color } = getStatusVisual(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-ui-sm ${color}`}>
      <span className="inline-flex shrink-0 items-center" aria-hidden>
        {icon}
      </span>
      <span>{status}</span>
    </span>
  );
}
