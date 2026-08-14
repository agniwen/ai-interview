import type { McpServerListResponse } from "@mastra/client-js";
import {
  DataList as EntityList,
  DataListSkeleton as EntityListSkeleton,
} from "@mastra/playground-ui/components/DataList";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { truncateString } from "@mastra/playground-ui/utils/truncate-string";
import { useMastraClient } from "@mastra/react";
import { useMemo } from "react";
import { useMCPServerTools } from "../../hooks/use-mcp-server-tools";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

type McpServer = McpServerListResponse["servers"][number];

export interface McpServersListProps {
  mcpServers: McpServer[];
  isLoading: boolean;
  search?: string;
}

function McpServerRow({ server }: { server: McpServer }) {
  const { paths, Link } = useLinkComponent();
  const client = useMastraClient();
  const { baseUrl } = client.options;
  const sseUrl = baseUrl ? `${baseUrl}/api/mcp/${server.id}/sse` : "";

  const { data: tools } = useMCPServerTools(server);
  const toolsList = Object.values(tools || {});
  const toolsCount = toolsList.length;
  const agentToolsCount = toolsList.filter((t) => t.toolType === "agent").length;
  const workflowToolsCount = toolsList.filter((t) => t.toolType === "workflow").length;

  const name = truncateString(server.name, 50);

  return (
    <EntityList.RowLink to={paths.mcpServerLink(server.id)} LinkComponent={Link}>
      <EntityList.NameCell>{name}</EntityList.NameCell>
      <EntityList.DescriptionCell>{sseUrl}</EntityList.DescriptionCell>
      <EntityList.TextCell className="text-center">{agentToolsCount || ""}</EntityList.TextCell>
      <EntityList.TextCell className="text-center">{toolsCount || ""}</EntityList.TextCell>
      <EntityList.TextCell className="text-center">{workflowToolsCount || ""}</EntityList.TextCell>
    </EntityList.RowLink>
  );
}

export function McpServersList({ mcpServers, isLoading, search = "" }: McpServersListProps) {
  const filteredData = useMemo(() => {
    const term = search.toLowerCase();
    return mcpServers.filter(
      (server) =>
        server.name?.toLowerCase().includes(term) || server.id?.toLowerCase().includes(term),
    );
  }, [mcpServers, search]);

  if (isLoading) {
    return <EntityListSkeleton columns="auto 1fr auto auto auto" />;
  }

  return (
    <EntityList columns="auto 1fr auto auto auto" variant="striped">
      <EntityList.Top>
        <EntityList.TopCell>名称</EntityList.TopCell>
        <EntityList.TopCell>URL</EntityList.TopCell>
        <EntityList.TopCellSmart
          long="智能体"
          short={<AgentIcon />}
          tooltip="智能体工具"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="工具"
          short={<ToolsIcon />}
          tooltip="工具"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="工作流"
          short={<WorkflowIcon />}
          tooltip="工作流工具"
          className="text-center"
        />
      </EntityList.Top>

      {filteredData.length === 0 && search ? (
        <EntityList.NoMatch message="没有符合搜索条件的 MCP 服务器" />
      ) : null}

      {filteredData.map((server) => (
        <McpServerRow key={server.id} server={server} />
      ))}
    </EntityList>
  );
}
