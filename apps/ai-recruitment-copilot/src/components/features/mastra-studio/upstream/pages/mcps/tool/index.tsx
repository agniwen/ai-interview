import { useParams } from "@/components/features/mastra-studio/router/compat";
import { MCPToolPanel } from "@/components/features/mastra-studio/upstream/domains/mcps/components/mcp-tool-panel";
import { useMCPServerTool } from "@/components/features/mastra-studio/upstream/domains/mcps/hooks/use-mcp-server-tool";

const MCPServerToolExecutor = () => {
  const { serverId, toolId } = useParams<{ serverId: string; toolId: string }>();
  const resolvedServerId = serverId ?? "";
  const resolvedToolId = toolId ?? "";

  const { data: mcpTool, isLoading } = useMCPServerTool(resolvedServerId, resolvedToolId);

  if (isLoading) {
    return null;
  }
  if (!mcpTool) {
    return null;
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <MCPToolPanel toolId={resolvedToolId} serverId={resolvedServerId} />
    </div>
  );
};

export default MCPServerToolExecutor;
