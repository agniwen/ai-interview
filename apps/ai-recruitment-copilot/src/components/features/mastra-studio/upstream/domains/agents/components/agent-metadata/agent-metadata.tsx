import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { GetToolResponse, GetWorkflowResponse } from "@mastra/client-js";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { codeLanguages, useCodemirrorTheme } from "@mastra/playground-ui/components/CodeEditor";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@mastra/playground-ui/components/Tooltip";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { ProcessorIcon } from "@mastra/playground-ui/icons/ProcessorIcon";
import { SkillIcon } from "@mastra/playground-ui/icons/SkillIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { GaugeIcon, Folder, Globe } from "lucide-react";
import { useActivatedSkills } from "../../context/activated-skills-context";
import { useAgent } from "../../hooks/use-agent";
import { useReorderModelList, useUpdateModelInModelList } from "../../hooks/use-agents";
import { extractPrompt } from "../../utils/extract-prompt";
import {
  AgentMetadataList,
  AgentMetadataListEmpty,
  AgentMetadataListItem,
} from "./agent-metadata-list";
import { AgentMetadataModelList } from "./agent-metadata-model-list";
import { AgentMetadataSection } from "./agent-metadata-section";
import { AgentMetadataWrapper } from "./agent-metadata-wrapper";
import { useIsCmsAvailable } from "@/components/features/mastra-studio/upstream/domains/cms/hooks/use-is-cms-available";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { WORKSPACE_TOOLS_PREFIX } from "@/components/features/mastra-studio/upstream/domains/workspace/constants";
import { LoadingBadge } from "@/components/features/mastra-studio/upstream/lib/ai-ui/tools/badges/loading-badge";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { resolveConditional } from "../../utils/conditional";

export interface AgentMetadataProps {
  agentId: string;
}

export interface AgentMetadataNetworkListProps {
  agents: { id: string; name: string }[];
}

export const AgentMetadataNetworkList = ({ agents }: AgentMetadataNetworkListProps) => {
  const { Link, paths } = useLinkComponent();

  if (agents.length === 0) {
    return <AgentMetadataListEmpty>暂无智能体</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {agents.map((agent) => (
        <AgentMetadataListItem key={agent.id}>
          <Link href={paths.agentLink(agent.id)} data-testid="agent-badge">
            <Badge variant="success" icon={<AgentIcon />}>
              {agent.name}
            </Badge>
          </Link>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

export const AgentMetadataCombinedProcessorList = ({
  inputProcessors,
  outputProcessors,
}: AgentMetadataCombinedProcessorListProps) => {
  const { Link, paths } = useLinkComponent();

  if (inputProcessors.length === 0 && outputProcessors.length === 0) {
    return <AgentMetadataListEmpty>暂无处理器</AgentMetadataListEmpty>;
  }

  // Use the first processor's ID for the link (they're grouped into a single workflow per type)
  const inputProcessorId = inputProcessors[0]?.id;
  const outputProcessorId = outputProcessors[0]?.id;

  return (
    <AgentMetadataList>
      {inputProcessors.length > 0 && inputProcessorId && (
        <AgentMetadataListItem>
          <Link
            href={`${paths.workflowLink(inputProcessorId)}/graph`}
            data-testid="processor-badge"
          >
            <Badge icon={<ProcessorIcon className="text-accent4" />}>输入</Badge>
          </Link>
        </AgentMetadataListItem>
      )}
      {outputProcessors.length > 0 && outputProcessorId && (
        <AgentMetadataListItem>
          <Link
            href={`${paths.workflowLink(outputProcessorId)}/graph`}
            data-testid="processor-badge"
          >
            <Badge icon={<ProcessorIcon className="text-accent5" />}>输出</Badge>
          </Link>
        </AgentMetadataListItem>
      )}
    </AgentMetadataList>
  );
};

export const AgentMetadataBrowserToolsList = ({ tools }: AgentMetadataBrowserToolsListProps) => {
  if (tools.length === 0) {
    return <AgentMetadataListEmpty>暂无浏览器工具</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {tools.map((tool) => (
        <AgentMetadataListItem key={tool}>
          <Badge icon={<Globe className="h-3 w-3 text-cyan-500" />}>{tool}</Badge>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

/**
 * Format a workspace tool name for display.
 * Converts "mastra_workspace_read_file" to "read_file"
 */
function formatWorkspaceToolName(toolName: string): string {
  const prefix = `${WORKSPACE_TOOLS_PREFIX}_`;
  if (toolName.startsWith(prefix)) {
    return toolName.slice(prefix.length);
  }
  return toolName;
}

export const AgentMetadataWorkspaceToolsList = ({
  tools,
}: AgentMetadataWorkspaceToolsListProps) => {
  if (tools.length === 0) {
    return <AgentMetadataListEmpty>暂无工作区工具</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {tools.map((tool) => (
        <AgentMetadataListItem key={tool}>
          <Badge icon={<Folder className="h-3 w-3 text-accent1" />}>
            {formatWorkspaceToolName(tool)}
          </Badge>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

export const AgentMetadataSkillList = ({
  skills,
  agentId,
  workspaceId,
}: AgentMetadataSkillListProps) => {
  const { Link, paths } = useLinkComponent();
  const { isSkillActivated } = useActivatedSkills();

  if (skills.length === 0) {
    return <AgentMetadataListEmpty>暂无技能</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {skills.map((skill) => {
        const isActivated = isSkillActivated(skill.name);
        const badge = (
          <Badge
            icon={
              <SkillIcon className={`h-3 w-3 ${isActivated ? "text-green-400" : "text-accent2"}`} />
            }
            variant={isActivated ? "success" : "default"}
          >
            {skill.name}
            {isActivated && <span className="sr-only">已启用</span>}
          </Badge>
        );

        return (
          <AgentMetadataListItem key={skill.path}>
            {isActivated ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={paths.agentSkillLink(agentId, skill.name, skill.path, workspaceId)}
                      data-testid="skill-badge"
                    >
                      {badge}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent className="bg-surface3 text-neutral6 border border-border1">
                    已启用
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Link
                href={paths.agentSkillLink(agentId, skill.name, skill.path, workspaceId)}
                data-testid="skill-badge"
              >
                {badge}
              </Link>
            )}
          </AgentMetadataListItem>
        );
      })}
    </AgentMetadataList>
  );
};

export const AgentMetadataScorerList = ({ entityId, entityType }: AgentMetadataScorerListProps) => {
  const { Link, paths } = useLinkComponent();
  const { data: scorers = {}, isLoading } = useScorers();

  const scorerList = Object.keys(scorers)
    .filter((scorerKey) => {
      const scorer = scorers[scorerKey];
      if (entityType === "AGENT") {
        return scorer.agentNames?.includes?.(entityId);
      }

      return scorer.workflowIds.includes(entityId);
    })
    .map((scorerKey) => ({ ...scorers[scorerKey], id: scorerKey }));

  if (isLoading) {
    return <LoadingBadge />;
  }

  if (scorerList.length === 0) {
    return <AgentMetadataListEmpty>暂无评分器</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {scorerList.map((scorer) => (
        <AgentMetadataListItem key={scorer.id}>
          <Link href={paths.scorerLink(scorer.id)} data-testid="scorer-badge">
            <Badge icon={<GaugeIcon className="text-neutral3" />}>
              {scorer.scorer.config.name}
            </Badge>
          </Link>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

export const AgentMetadataWorkflowList = ({ workflows }: AgentMetadataWorkflowListProps) => {
  const { Link, paths } = useLinkComponent();

  if (workflows.length === 0) {
    return <AgentMetadataListEmpty>暂无工作流</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {workflows.map((workflow) => (
        <AgentMetadataListItem key={workflow.id}>
          <Link href={paths.workflowLink(workflow.id)} data-testid="workflow-badge">
            <Badge icon={<WorkflowIcon className="text-accent3" />}>{workflow.name}</Badge>
          </Link>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

export const AgentMetadataToolList = ({ tools, agentId }: AgentMetadataToolListProps) => {
  const { Link, paths } = useLinkComponent();

  if (tools.length === 0) {
    return <AgentMetadataListEmpty>暂无工具</AgentMetadataListEmpty>;
  }

  return (
    <AgentMetadataList>
      {tools.map((tool) => (
        <AgentMetadataListItem key={tool.id}>
          <Link href={paths.agentToolLink(agentId, tool.id)} data-testid="tool-badge">
            <Badge icon={<ToolsIcon className="text-accent6" />}>{tool.id}</Badge>
          </Link>
        </AgentMetadataListItem>
      ))}
    </AgentMetadataList>
  );
};

export const AgentMetadata = ({ agentId }: AgentMetadataProps) => {
  const { data: agent, isLoading } = useAgent(agentId);
  const { mutate: reorderModelList } = useReorderModelList(agentId);
  const { mutateAsync: updateModelInModelList } = useUpdateModelInModelList(agentId);
  const codemirrorTheme = useCodemirrorTheme();
  const { isCmsAvailable, isLoading: isCmsLoading } = useIsCmsAvailable();

  if (isLoading) {
    return <Skeleton className="h-full" />;
  }

  if (!agent) {
    return <div>未找到智能体</div>;
  }

  const networkAgentsMap = agent.agents ?? {};
  const networkAgents = Object.keys(networkAgentsMap).map((key) => ({
    ...networkAgentsMap[key],
    id: key,
  }));

  const agentTools = agent.tools ?? {};
  const tools = Object.keys(agentTools).map((key) => agentTools[key]);

  const agentWorkflows = agent.workflows ?? {};
  const workflows = Object.keys(agentWorkflows).map((key) => ({ id: key, ...agentWorkflows[key] }));

  const skills = agent.skills ?? [];
  const workspaceTools = agent.workspaceTools ?? [];
  const browserTools = agent.browserTools ?? [];
  const { workspaceId } = agent;
  const inputProcessors = agent.inputProcessors ?? [];
  const outputProcessors = agent.outputProcessors ?? [];

  return (
    <AgentMetadataWrapper>
      {resolveConditional(
        agent?.description,
        () => (
          <AgentMetadataSection title="描述">
            <p className="text-sm text-neutral6">{agent.description}</p>
          </AgentMetadataSection>
        ),
        () => null,
      )}
      {resolveConditional(
        agent.modelList,
        (conditionValue) => (
          <AgentMetadataSection title="模型">
            <AgentMetadataModelList
              modelList={conditionValue}
              updateModelInModelList={updateModelInModelList}
              reorderModelList={reorderModelList}
            />
          </AgentMetadataSection>
        ),
        () => null,
      )}

      {resolveConditional(
        networkAgents.length > 0,
        () => (
          <AgentMetadataSection
            title="智能体"
            hint={{
              link: "https://mastra.ai/en/docs/agents/overview",
              title: "智能体文档",
            }}
          >
            <AgentMetadataNetworkList agents={networkAgents} />
          </AgentMetadataSection>
        ),
        () => null,
      )}

      <AgentMetadataSection
        title="工具"
        hint={{
          link: "https://mastra.ai/en/docs/agents/using-tools-and-mcp",
          title: "工具与 MCP 使用文档",
        }}
      >
        <AgentMetadataToolList tools={tools} agentId={agentId} />
      </AgentMetadataSection>

      <AgentMetadataSection
        title="工作流"
        hint={{
          link: "https://mastra.ai/en/docs/workflows/overview",
          title: "工作流文档",
        }}
      >
        <AgentMetadataWorkflowList workflows={workflows} />
      </AgentMetadataSection>

      <AgentMetadataSection
        title="技能"
        hint={{
          link: "https://mastra.ai/en/docs/workspace/skills",
          title: "技能文档",
        }}
      >
        <AgentMetadataSkillList skills={skills} agentId={agentId} workspaceId={workspaceId} />
      </AgentMetadataSection>

      {resolveConditional(
        workspaceTools.length > 0,
        () => (
          <AgentMetadataSection
            title="工作区工具"
            hint={{
              link: "https://mastra.ai/en/reference/workspace/workspace-class#agent-tools",
              title: "工作区工具文档",
            }}
          >
            <AgentMetadataWorkspaceToolsList tools={workspaceTools} />
          </AgentMetadataSection>
        ),
        () => null,
      )}

      {resolveConditional(
        browserTools.length > 0,
        () => (
          <AgentMetadataSection
            title="浏览器工具"
            hint={{
              link: "https://mastra.ai/en/docs/agents/adding-browser-control",
              title: "浏览器工具文档",
            }}
          >
            <AgentMetadataBrowserToolsList tools={browserTools} />
          </AgentMetadataSection>
        ),
        () => null,
      )}

      {resolveConditional(
        inputProcessors.length > 0,
        (conditionValue) => conditionValue,
        () =>
          outputProcessors.length > 0 && (
            <AgentMetadataSection
              title="处理器"
              hint={{
                link: "https://mastra.ai/docs/agents/processors",
                title: "处理器文档",
              }}
            >
              <AgentMetadataCombinedProcessorList
                inputProcessors={inputProcessors}
                outputProcessors={outputProcessors}
              />
            </AgentMetadataSection>
          ),
      )}

      <AgentMetadataSection title="评分器">
        <AgentMetadataScorerList entityId={agent.name} entityType="AGENT" />
      </AgentMetadataSection>
      <AgentMetadataSection title="系统提示词">
        <CodeMirror
          className="border border-border1 rounded-md"
          value={extractPrompt(agent.instructions)}
          editable={false}
          extensions={[
            markdown({ base: markdownLanguage, codeLanguages }),
            EditorView.lineWrapping,
          ]}
          theme={codemirrorTheme}
        />
        {resolveConditional(
          !isCmsLoading && !isCmsAvailable,
          () => (
            <Notice variant="warning" title="只读">
              <Notice.Message>
                若要在 Studio 中编辑系统提示词，请将{" "}
                <code className="font-medium">@mastra/editor</code> 添加到项目中。请参阅{" "}
                <a
                  href="https://mastra.ai/docs/editor/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  文档
                </a>
                .
              </Notice.Message>
            </Notice>
          ),
          () => null,
        )}
      </AgentMetadataSection>
    </AgentMetadataWrapper>
  );
};

export interface AgentMetadataToolListProps {
  tools: GetToolResponse[];
  agentId: string;
}

export interface AgentMetadataWorkflowListProps {
  workflows: ({ id: string } & GetWorkflowResponse)[];
}

interface AgentMetadataScorerListProps {
  entityId: string;
  entityType: string;
}

export interface AgentMetadataSkillListProps {
  skills: {
    name: string;
    description: string;
    license?: string;
    path: string;
  }[];
  agentId: string;
  workspaceId?: string;
}

export interface AgentMetadataWorkspaceToolsListProps {
  tools: string[];
}

export interface AgentMetadataBrowserToolsListProps {
  tools: string[];
}

export interface AgentMetadataCombinedProcessorListProps {
  inputProcessors: { id: string; name: string }[];
  outputProcessors: { id: string; name: string }[];
}
