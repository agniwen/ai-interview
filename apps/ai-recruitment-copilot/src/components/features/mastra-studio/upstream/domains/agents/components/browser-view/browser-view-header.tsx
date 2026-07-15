import { StatusBadge } from "@mastra/playground-ui/components/StatusBadge";
import { cn } from "@mastra/playground-ui/utils/cn";
import { X, ChevronDown, ChevronUp, Minus } from "lucide-react";
import type { StreamStatus } from "../../hooks/use-browser-stream";

interface BrowserViewHeaderProps {
  url: string | null;
  status: StreamStatus;
  isCollapsed?: boolean;
  className?: string;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  onTuck?: () => void;
}

/**
 * Get StatusBadge configuration based on stream status
 */
function getStatusBadgeConfig(status: StreamStatus): {
  variant: "success" | "warning" | "error" | "neutral";
  pulse: boolean;
  label: string;
} {
  switch (status) {
    case "idle": {
      return { label: "空闲", pulse: false, variant: "neutral" };
    }
    case "connecting": {
      return { label: "正在连接", pulse: true, variant: "warning" };
    }
    case "connected": {
      return { label: "已连接", pulse: true, variant: "warning" };
    }
    case "browser_starting": {
      return { label: "正在启动", pulse: true, variant: "warning" };
    }
    case "streaming": {
      return { label: "实时", pulse: false, variant: "success" };
    }
    case "browser_closed": {
      return { label: "已关闭", pulse: false, variant: "neutral" };
    }
    case "disconnected": {
      return { label: "未连接", pulse: true, variant: "error" };
    }
    case "error": {
      return { label: "错误", pulse: false, variant: "error" };
    }
    default: {
      return { label: "未知", pulse: false, variant: "neutral" };
    }
  }
}

/**
 * Browser view header component with URL bar, status indicator, and close button.
 */
export function BrowserViewHeader({
  url,
  status,
  isCollapsed,
  className,
  onClose,
  onToggleCollapse,
  onTuck,
}: BrowserViewHeaderProps) {
  const { variant, pulse, label } = getStatusBadgeConfig(status);

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 border-b border-border1 bg-surface1",
        isCollapsed ? "rounded-md" : "rounded-t-md",
        className,
      )}
    >
      {/* URL display */}
      <div className="flex-1 min-w-0 mr-3">
        <span
          className={cn("text-sm text-neutral4 truncate block", !url && "text-neutral3 italic")}
        >
          {url || "无 URL"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Status badge */}
        <StatusBadge variant={variant} size="sm" withDot pulse={pulse}>
          {label}
        </StatusBadge>

        {/* Tuck away to pill */}
        {onTuck && (
          <button
            onClick={onTuck}
            className="p-1 rounded hover:bg-surface3 text-neutral3 hover:text-neutral6 transition-colors"
            title="最小化为悬浮条"
          >
            <Minus className="h-4 w-4" />
          </button>
        )}

        {/* Collapse/expand toggle */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded hover:bg-surface3 text-neutral3 hover:text-neutral6 transition-colors"
            title={isCollapsed ? "展开浏览器视图" : "最小化浏览器视图"}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        )}

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface3 text-neutral3 hover:text-neutral6 transition-colors"
            title="关闭浏览器会话"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
