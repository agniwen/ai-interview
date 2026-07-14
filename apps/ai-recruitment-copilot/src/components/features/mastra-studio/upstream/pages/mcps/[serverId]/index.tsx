import { useParams } from "@/components/features/mastra-studio/router/compat";
import { MCPDetail } from "@/components/features/mastra-studio/upstream/domains/mcps/components/mcp-detail";
import { useMCPServers } from "@/components/features/mastra-studio/upstream/domains/mcps/hooks/use-mcp-servers";

export const McpServerPage = () => {
  const { serverId } = useParams();
  const { data: mcpServers = [], isLoading } = useMCPServers();

  const server = mcpServers.find((candidate) => candidate.id === serverId);

  return (
    <div className="h-full w-full overflow-hidden">
      <MCPDetail isLoading={isLoading} server={server} />
    </div>
  );
};
