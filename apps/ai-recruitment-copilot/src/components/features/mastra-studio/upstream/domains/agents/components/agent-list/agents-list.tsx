import type { GetAgentResponse } from "@mastra/client-js";
import {
  DataList as EntityList,
  DataListSkeleton as EntityListSkeleton,
} from "@mastra/playground-ui/components/DataList";
import { TextAndIcon } from "@mastra/playground-ui/components/Text";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { truncateString } from "@mastra/playground-ui/utils/truncate-string";
import { useMemo } from "react";
import { extractPrompt } from "../../utils/extract-prompt";
import { ProviderLogo } from "../agent-metadata/provider-logo";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface AgentsListProps {
  agents: Record<string, GetAgentResponse>;
  isLoading: boolean;
  search?: string;
}

export function AgentsList({ agents, isLoading, search = "" }: AgentsListProps) {
  const { paths, Link } = useLinkComponent();

  const agentData = useMemo(() => Object.values(agents ?? {}), [agents]);

  const filteredData = useMemo(() => {
    const term = search.toLowerCase();
    return agentData.filter((agent) => {
      const instructions = extractPrompt(agent.instructions);
      return agent.name.toLowerCase().includes(term) || instructions.toLowerCase().includes(term);
    });
  }, [agentData, search]);

  if (isLoading) {
    return <EntityListSkeleton columns="auto 1fr auto auto auto auto" />;
  }

  return (
    <EntityList columns={"auto 1fr auto auto auto auto"} variant="striped">
      <EntityList.Top>
        <EntityList.TopCell className="">名称</EntityList.TopCell>
        <EntityList.TopCell className="">指令</EntityList.TopCell>
        <EntityList.TopCell className="">模型</EntityList.TopCell>
        <EntityList.TopCellSmart
          long="工作流"
          short={<WorkflowIcon />}
          tooltip="已关联的工作流数量"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="智能体"
          short={<AgentIcon />}
          tooltip="已关联的智能体数量"
          className="text-center"
        />
        <EntityList.TopCellSmart
          long="工具"
          short={<ToolsIcon />}
          tooltip="已关联的工具数量"
          className="text-center"
        />
      </EntityList.Top>

      {filteredData.length === 0 && search ? (
        <EntityList.NoMatch message="没有与搜索条件匹配的智能体" />
      ) : null}

      {filteredData.map((agent) => {
        const name = truncateString(agent.name, 50);
        const instructions = truncateString(extractPrompt(agent.instructions), 200);
        const agentsCount = Object.keys(agent.agents ?? {}).length;
        const toolsCount = Object.keys(agent.tools ?? {}).length;
        const workflowsCount = Object.keys(agent.workflows ?? {}).length;

        return (
          <EntityList.RowLink key={agent.id} to={paths.agentLink(agent.id)} LinkComponent={Link}>
            <EntityList.NameCell>{name || ""}</EntityList.NameCell>
            <EntityList.DescriptionCell>{instructions || ""}</EntityList.DescriptionCell>
            <EntityList.Cell>
              <TextAndIcon>
                {agent.provider && (
                  <ProviderLogo providerId={agent.provider} className="dark:invert" />
                )}
                <span className="truncate">{agent.modelId || "暂无"}</span>
              </TextAndIcon>
            </EntityList.Cell>
            <EntityList.TextCell className="text-center">
              {workflowsCount || ""}
            </EntityList.TextCell>
            <EntityList.TextCell className="text-center">{agentsCount || ""}</EntityList.TextCell>
            <EntityList.TextCell className="text-center">{toolsCount || ""}</EntityList.TextCell>
          </EntityList.RowLink>
        );
      })}
    </EntityList>
  );
}
