import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useAgents } from "../../agents/hooks/use-agents";
import { useTools } from "../hooks/use-all-tools";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface ToolComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
}

export function ToolCombobox({
  value,
  onValueChange,
  placeholder = "选择工具...",
  searchPlaceholder = "搜索工具...",
  emptyText = "未找到工具。",
  className,
  disabled = false,
  variant,
}: ToolComboboxProps) {
  const {
    data: tools = {},
    isLoading: isLoadingTools,
    isError: isErrorTools,
    error: errorTools,
  } = useTools();
  const {
    data: agents = {},
    isLoading: isLoadingAgents,
    isError: isErrorAgents,
    error: errorAgents,
  } = useAgents();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isErrorTools) {
      const errorMessage = errorTools instanceof Error ? errorTools.message : "加载工具失败";
      toast.error(`加载工具时出错：${errorMessage}`);
    }
  }, [isErrorTools, errorTools]);

  useEffect(() => {
    if (isErrorAgents) {
      const errorMessage = errorAgents instanceof Error ? errorAgents.message : "加载智能体失败";
      toast.error(`加载智能体时出错：${errorMessage}`);
    }
  }, [isErrorAgents, errorAgents]);

  const allTools = new Map<string, { id: string }>();

  // Get tools from agents
  for (const agent of Object.values(agents)) {
    if (agent.tools) {
      for (const tool of Object.values(agent.tools)) {
        if (!allTools.has(tool.id)) {
          allTools.set(tool.id, tool);
        }
      }
    }
  }

  // Get standalone/discovered tools
  for (const tool of Object.values(tools)) {
    if (!allTools.has(tool.id)) {
      allTools.set(tool.id, tool);
    }
  }

  const toolOptions = [...allTools.values()].map((tool) => ({
    label: tool.id,
    value: tool.id,
  }));

  const handleValueChange = (newToolId: string) => {
    if (onValueChange) {
      onValueChange(newToolId);
    } else if (newToolId && newToolId !== value) {
      navigate(paths.toolLink(newToolId));
    }
  };

  return (
    <Combobox
      options={toolOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoadingTools || isLoadingAgents ? "正在加载工具..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoadingTools || isLoadingAgents || isErrorTools || isErrorAgents}
      variant={variant}
    />
  );
}
