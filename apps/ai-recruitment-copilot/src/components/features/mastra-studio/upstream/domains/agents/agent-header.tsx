import { Breadcrumb, Crumb } from "@mastra/playground-ui/components/Breadcrumb";
import { Button } from "@mastra/playground-ui/components/Button";
import { Header, HeaderAction } from "@mastra/playground-ui/components/Header";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { DocsIcon } from "@mastra/playground-ui/icons/DocsIcon";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { Link } from "@/components/features/mastra-studio/router/compat";
import { AgentCombobox } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-combobox";

export function AgentHeader({ agentId }: { agentId: string }) {
  return (
    <Header border={false}>
      <Breadcrumb>
        <Crumb as={Link} to={`/agents`}>
          <Icon>
            <AgentIcon />
          </Icon>
          智能体
        </Crumb>
        <Crumb as="span" to="" isCurrent>
          <AgentCombobox value={agentId} variant="ghost" size="sm" />
        </Crumb>
      </Breadcrumb>

      <HeaderAction>
        <Button
          as={Link}
          to="https://mastra.ai/en/docs/agents/overview"
          target="_blank"
          variant="ghost"
          size="md"
        >
          <DocsIcon />
          智能体文档
        </Button>
      </HeaderAction>
    </Header>
  );
}
