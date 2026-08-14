import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { DatasetsIcon } from "@mastra/playground-ui/icons/DatasetsIcon";
import { ExperimentsIcon } from "@mastra/playground-ui/icons/ExperimentsIcon";
import { HomeIcon } from "@mastra/playground-ui/icons/HomeIcon";
import { LogsIcon } from "@mastra/playground-ui/icons/LogsIcon";
import { McpServerIcon } from "@mastra/playground-ui/icons/McpServerIcon";
import { MetricsIcon } from "@mastra/playground-ui/icons/MetricsIcon";
import { ProcessorIcon } from "@mastra/playground-ui/icons/ProcessorIcon";
import { PromptIcon } from "@mastra/playground-ui/icons/PromptIcon";
import { RequestContextIcon } from "@mastra/playground-ui/icons/RequestContextIcon";
import { ScorersIcon } from "@mastra/playground-ui/icons/ScorersIcon";
import { SettingsIcon } from "@mastra/playground-ui/icons/SettingsIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { TraceIcon } from "@mastra/playground-ui/icons/TraceIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { WorkspacesIcon } from "@mastra/playground-ui/icons/WorkspacesIcon";
import { BookIcon } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  name: string;
  url: string;
  Icon: NavIcon;
  docs?: { href: string; label?: string };
  isOnMastraPlatform?: boolean;
  activePaths?: string[];
  /** When true, the item stays in the registry (so breadcrumbs/routes can resolve it) but is hidden from the sidebar and command palette. */
  hidden?: boolean;
}

export interface NavSection {
  key: string;
  title: string;
  href?: string;
  items: NavItem[];
}

export const mainNav: NavSection[] = [
  {
    items: [
      {
        Icon: AgentIcon,
        docs: { href: "https://mastra.ai/en/docs/agents/overview", label: "智能体文档" },
        isOnMastraPlatform: true,
        name: "智能体",
        url: "/agents",
      },
      {
        Icon: PromptIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/agent-instructions#prompt-blocks",
          label: "提示词文档",
        },
        isOnMastraPlatform: true,
        name: "提示词",
        url: "/prompts",
      },
      {
        Icon: WorkflowIcon,
        docs: {
          href: "https://mastra.ai/en/docs/workflows/overview",
          label: "工作流文档",
        },
        isOnMastraPlatform: true,
        name: "工作流",
        url: "/workflows",
      },
      {
        Icon: ProcessorIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/processors",
          label: "处理器文档",
        },
        isOnMastraPlatform: false,
        name: "处理器",
        url: "/processors",
      },
      {
        Icon: McpServerIcon,
        docs: {
          href: "https://mastra.ai/en/docs/tools-mcp/mcp-overview",
          label: "MCP 文档",
        },
        isOnMastraPlatform: true,
        name: "MCP 服务器",
        url: "/mcps",
      },
      {
        Icon: ToolsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/using-tools-and-mcp",
          label: "工具文档",
        },
        isOnMastraPlatform: true,
        name: "工具",
        url: "/tools",
      },
      {
        Icon: WorkspacesIcon,
        docs: {
          href: "https://mastra.ai/en/docs/workspace/overview",
          label: "工作区文档",
        },
        isOnMastraPlatform: true,
        name: "工作区",
        url: "/workspaces",
      },
      {
        Icon: RequestContextIcon,
        isOnMastraPlatform: true,
        name: "请求上下文",
        url: "/request-context",
      },
    ],
    key: "primitives",
    title: "基础能力",
  },
  {
    items: [
      {
        Icon: HomeIcon,
        isOnMastraPlatform: true,
        name: "概览",
        url: "/evaluation",
      },
      {
        Icon: ScorersIcon,
        docs: { href: "https://mastra.ai/en/docs/evals/overview", label: "评分器文档" },
        isOnMastraPlatform: true,
        name: "评分器",
        url: "/scorers",
      },
      {
        Icon: DatasetsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/evals/datasets/overview",
          label: "数据集文档",
        },
        isOnMastraPlatform: true,
        name: "数据集",
        url: "/datasets",
      },
      {
        Icon: ExperimentsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/evals/datasets/running-experiments",
          label: "实验文档",
        },
        isOnMastraPlatform: true,
        name: "实验",
        url: "/experiments",
      },
    ],
    key: "evaluation",
    title: "评估",
  },
  {
    items: [
      {
        Icon: MetricsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/observability/overview",
          label: "指标文档",
        },
        isOnMastraPlatform: true,
        name: "指标",
        url: "/metrics",
      },
      {
        Icon: TraceIcon,
        activePaths: ["/traces"],
        docs: {
          href: "https://mastra.ai/en/docs/observability/tracing/overview",
          label: "追踪文档",
        },
        isOnMastraPlatform: true,
        name: "追踪",
        url: "/observability",
      },
      {
        Icon: LogsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/observability/logging",
          label: "日志文档",
        },
        isOnMastraPlatform: true,
        name: "日志",
        url: "/logs",
      },
    ],
    key: "observability",
    title: "可观测性",
  },
];

export const bottomNav: NavItem[] = [
  { Icon: SettingsIcon, isOnMastraPlatform: false, name: "设置", url: "/settings" },
  { Icon: BookIcon, isOnMastraPlatform: true, name: "资源", url: "/resources" },
];

/** Section-level entries used to resolve breadcrumb label + icon for the overview routes. */
export const sectionNav: NavItem[] = [
  {
    Icon: ExperimentsIcon,
    docs: { href: "https://mastra.ai/en/docs/evals/overview", label: "评估文档" },
    name: "评估",
    url: "/evaluation",
  },
];

// sectionNav comes first so /evaluation resolves to "Evaluation" (section crumb) rather than the
// in-section "Overview" NavLink which shares the same url.
const allItems: NavItem[] = [...sectionNav, ...mainNav.flatMap((s) => s.items), ...bottomNav];

export function findNavItem(url: string): NavItem | undefined {
  return allItems.find((i) => i.url === url);
}
