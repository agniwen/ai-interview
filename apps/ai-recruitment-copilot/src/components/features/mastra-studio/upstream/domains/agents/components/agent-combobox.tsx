import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useAgents } from "../hooks/use-agents";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface AgentComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
  size?: ComboboxProps["size"];
}

export function AgentCombobox({
  value,
  onValueChange,
  placeholder = "选择智能体…",
  searchPlaceholder = "搜索智能体…",
  emptyText = "未找到智能体。",
  className,
  disabled = false,
  variant,
  size,
}: AgentComboboxProps) {
  const { data: agents = {}, isLoading, isError, error } = useAgents();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载智能体失败";
      toast.error(`加载智能体失败：${errorMessage}`);
    }
  }, [isError, error]);

  const agentOptions = Object.keys(agents).map((key) => ({
    label: agents[key]?.name || key,
    value: key,
  }));

  const handleValueChange = (newAgentId: string) => {
    if (onValueChange) {
      onValueChange(newAgentId);
    } else if (newAgentId && newAgentId !== value) {
      navigate(paths.agentLink(newAgentId));
    }
  };

  return (
    <Combobox
      options={agentOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载智能体…" : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
      size={size}
    />
  );
}
