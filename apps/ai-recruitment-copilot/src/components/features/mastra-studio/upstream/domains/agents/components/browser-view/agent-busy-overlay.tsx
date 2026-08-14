import { Loader2 } from "lucide-react";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // AgentBrowser tools
  browser_click: "正在点击",
  browser_close: "正在关闭",
  browser_goto: "正在导航",
  browser_navigate: "正在导航",
  browser_screenshot: "正在截取",
  browser_scroll: "正在滚动",
  browser_select: "正在选择",
  browser_snapshot: "正在读取页面",
  browser_type: "正在输入",
  // StagehandBrowser tools
  stagehand_act: "正在操作",
  stagehand_close: "正在关闭",
  stagehand_extract: "正在提取",
  stagehand_navigate: "正在导航",
  stagehand_observe: "正在观测",
  stagehand_screenshot: "正在截取",
};

export interface AgentBusyOverlayProps {
  toolName: string | null;
}

/**
 * Semi-transparent overlay shown when agent is executing a browser tool.
 *
 * The overlay absorbs click events (default pointer-events behavior for
 * positioned elements) preventing user clicks from reaching the img element.
 * Mouse moves still show cursor on top of the overlay.
 */
export function AgentBusyOverlay({ toolName }: AgentBusyOverlayProps) {
  const displayName = toolName
    ? (TOOL_DISPLAY_NAMES[toolName] ?? toolName.replace(/^(browser_|stagehand_)/, ""))
    : "正在处理";

  return (
    <div className="absolute inset-0 bg-surface1/40 flex items-center justify-center z-10 cursor-not-allowed">
      <div className="flex items-center gap-2 bg-surface2 px-3 py-1.5 rounded-md border border-border1 shadow-sm">
        <Loader2 className="h-3.5 w-3.5 text-accent1 animate-spin" />
        <span className="text-xs font-medium text-neutral4">Agent: {displayName}</span>
      </div>
    </div>
  );
}
