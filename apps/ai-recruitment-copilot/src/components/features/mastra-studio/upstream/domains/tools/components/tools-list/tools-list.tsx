import type { GetAgentResponse, GetToolResponse } from "@mastra/client-js";
import {
  DataList as EntityList,
  DataListSkeleton as EntityListSkeleton,
} from "@mastra/playground-ui/components/DataList";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { truncateString } from "@mastra/playground-ui/utils/truncate-string";
import { useMemo } from "react";
import { prepareToolsTable } from "@/components/features/mastra-studio/upstream/domains/tools/utils/prepare-tools-table";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface ToolsListProps {
  tools: Record<string, GetToolResponse>;
  agents: Record<string, GetAgentResponse>;
  isLoading: boolean;
  search?: string;
}

export function ToolsList({ tools, agents, isLoading, search = "" }: ToolsListProps) {
  const { paths, Link } = useLinkComponent();

  const toolData = useMemo(() => prepareToolsTable(tools, agents), [tools, agents]);

  const filteredData = useMemo(
    () => toolData.filter((tool) => tool.id.toLowerCase().includes(search.toLowerCase())),
    [toolData, search],
  );

  if (isLoading) {
    return <EntityListSkeleton columns="auto 1fr auto" />;
  }

  return (
    <EntityList columns="auto 1fr auto" variant="striped">
      <EntityList.Top>
        <EntityList.TopCell>名称</EntityList.TopCell>
        <EntityList.TopCell>描述</EntityList.TopCell>
        <EntityList.TopCellSmart
          long="智能体"
          short={<AgentIcon />}
          tooltip="已关联的智能体"
          className="text-center"
        />
      </EntityList.Top>

      {filteredData.length === 0 && search ? (
        <EntityList.NoMatch message="没有符合搜索条件的工具" />
      ) : null}

      {filteredData.map((tool) => {
        const name = truncateString(tool.id, 50);
        const description = truncateString(tool.description ?? "", 200);
        const agentsCount = tool.agents.length;

        return (
          <EntityList.RowLink key={tool.id} to={paths.toolLink(tool.id)} LinkComponent={Link}>
            <EntityList.NameCell>{name}</EntityList.NameCell>
            <EntityList.DescriptionCell>{description}</EntityList.DescriptionCell>
            <EntityList.TextCell className="text-center">{agentsCount || ""}</EntityList.TextCell>
          </EntityList.RowLink>
        );
      })}
    </EntityList>
  );
}
