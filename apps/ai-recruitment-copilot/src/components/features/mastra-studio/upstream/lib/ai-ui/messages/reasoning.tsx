import { Badge } from "@mastra/playground-ui/components/Badge";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { BrainIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";

export interface ReasoningProps {
  text: string;
  redacted?: boolean;
}

export const Reasoning = ({ text, redacted }: ReasoningProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const body = redacted ? "推理内容已被提供商隐藏。" : text;

  if (!body) {
    return null;
  }

  return (
    <div className="mb-2 space-y-2">
      <button onClick={() => setIsCollapsed((s) => !s)} className="flex items-center gap-2">
        <Icon>
          <ChevronUpIcon
            className={cn("transition-all", isCollapsed ? "rotate-90" : "rotate-180")}
          />
        </Icon>
        <Badge icon={<BrainIcon />}>{isCollapsed ? "显示推理内容" : "隐藏推理内容"}</Badge>
      </button>

      {isCollapsed ? null : (
        <div className="rounded-lg bg-surface4 p-2 border border-border-1">
          <pre className="whitespace-pre-wrap text-ui-sm leading-ui-sm text-neutral6">{body}</pre>
        </div>
      )}
    </div>
  );
};
