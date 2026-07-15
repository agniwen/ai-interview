import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useMCPServers } from "../hooks/use-mcp-servers";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface MCPServerComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
  container?: HTMLElement | ShadowRoot | null | React.RefObject<HTMLElement | ShadowRoot | null>;
}

export function MCPServerCombobox({
  value,
  onValueChange,
  placeholder = "选择 MCP 服务器...",
  searchPlaceholder = "搜索 MCP 服务器...",
  emptyText = "未找到 MCP 服务器。",
  className,
  disabled = false,
  variant,
  container,
}: MCPServerComboboxProps) {
  const { data: mcpServers = [], isLoading, isError, error } = useMCPServers();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载 MCP 服务器失败";
      toast.error(`加载 MCP 服务器时出错：${errorMessage}`);
    }
  }, [isError, error]);

  const mcpServerOptions = mcpServers.map((server) => ({
    label: server.name,
    value: server.id,
  }));

  const handleValueChange = (newServerId: string) => {
    if (onValueChange) {
      onValueChange(newServerId);
    } else if (newServerId && newServerId !== value) {
      navigate(paths.mcpServerLink(newServerId));
    }
  };

  return (
    <Combobox
      options={mcpServerOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载 MCP 服务器..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
      container={container}
    />
  );
}
