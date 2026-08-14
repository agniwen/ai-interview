import {
  Entity,
  EntityContent,
  EntityDescription,
  EntityIcon,
  EntityName,
} from "@mastra/playground-ui/components/Entity";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Switch } from "@mastra/playground-ui/components/Switch";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { McpServerIcon } from "@mastra/playground-ui/icons/McpServerIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { cn } from "@mastra/playground-ui/utils/cn";
import type { TryConnectMcpMutation } from "../../hooks/use-try-connect-mcp";

interface MCPClientToolPreviewProps {
  serverType: "stdio" | "http";
  url: string;
  tryConnect: TryConnectMcpMutation;
  selectedTools?: Record<string, { description?: string }>;
  onToggleTool?: (toolName: string, description?: string) => void;
  onDescriptionChange?: (toolName: string, description: string) => void;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-full p-8 text-center">{children}</div>;
}

function ToolList({
  tools,
  selectedTools = {},
  onToggleTool,
  onDescriptionChange,
}: {
  tools: { name: string; description?: string }[];
  selectedTools?: Record<string, { description?: string }>;
  onToggleTool?: (toolName: string, description?: string) => void;
  onDescriptionChange?: (toolName: string, description: string) => void;
}) {
  const selectedCount = Object.keys(selectedTools).length;

  return (
    <div className="p-5 overflow-y-auto">
      <div className="text-neutral6 flex gap-2 items-center">
        <Icon size="lg" className="bg-surface4 rounded-md p-1">
          <McpServerIcon />
        </Icon>
        <Txt variant="header-md" as="h2" className="font-medium">
          可用工具（已选择 {selectedCount}/{tools.length}）
        </Txt>
      </div>

      <div className="flex flex-col gap-2 pt-6">
        {tools.map((tool) => {
          const isSelected = tool.name in selectedTools;
          const isDisabled = !onDescriptionChange || !isSelected;

          return (
            <Entity key={tool.name}>
              <EntityIcon>
                <ToolsIcon className="group-hover/entity:text-accent6" />
              </EntityIcon>
              <EntityContent>
                <EntityName>{tool.name}</EntityName>
                <EntityDescription>
                  <input
                    type="text"
                    aria-label={`${tool.name} 描述`}
                    disabled={isDisabled}
                    className={cn(
                      "border border-transparent appearance-none block w-full text-neutral3 bg-transparent",
                      !isDisabled && "border-border1 border-dashed",
                    )}
                    value={
                      isSelected
                        ? (selectedTools[tool.name]?.description ?? tool.description ?? "")
                        : (tool.description ?? "")
                    }
                    onChange={(e) => onDescriptionChange?.(tool.name, e.target.value)}
                  />
                </EntityDescription>
              </EntityContent>
              {onToggleTool && (
                <Switch
                  checked={isSelected}
                  onCheckedChange={() => onToggleTool(tool.name, tool.description)}
                />
              )}
            </Entity>
          );
        })}
      </div>
    </div>
  );
}

export function MCPClientToolPreview({
  serverType,
  url,
  tryConnect,
  selectedTools,
  onToggleTool,
  onDescriptionChange,
}: MCPClientToolPreviewProps) {
  if (serverType === "stdio") {
    return (
      <EmptyState>
        <Txt className="text-neutral3">HTTP 服务器支持工具预览，Stdio 服务器无法预览。</Txt>
      </EmptyState>
    );
  }

  if (!url.trim()) {
    return (
      <EmptyState>
        <Txt className="text-neutral3">输入 URL 并点击“尝试连接”以预览可用工具。</Txt>
      </EmptyState>
    );
  }

  if (tryConnect.isIdle) {
    return (
      <EmptyState>
        <Txt className="text-neutral3">点击“尝试连接”以预览可用工具。</Txt>
      </EmptyState>
    );
  }

  return (
    <div className="p-5">
      {tryConnect.isPending && (
        <div className="flex items-center gap-2">
          <Spinner className="h-3 w-3" />
          <Txt className="text-neutral3">正在连接...</Txt>
        </div>
      )}

      {tryConnect.isError && (
        <Txt variant="ui-sm" className="text-accent2">
          {tryConnect.error instanceof Error ? tryConnect.error.message : "连接失败"}
        </Txt>
      )}

      {tryConnect.isSuccess && tryConnect.data.tools.length === 0 && (
        <Txt className="text-neutral3">连接成功，但未找到工具。</Txt>
      )}

      {tryConnect.isSuccess && tryConnect.data.tools.length > 0 && (
        <ToolList
          tools={tryConnect.data.tools}
          selectedTools={selectedTools}
          onToggleTool={onToggleTool}
          onDescriptionChange={onDescriptionChange}
        />
      )}
    </div>
  );
}
