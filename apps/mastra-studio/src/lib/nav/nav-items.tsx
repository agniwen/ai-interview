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
        docs: { href: "https://mastra.ai/en/docs/agents/overview", label: "Agents documentation" },
        isOnMastraPlatform: true,
        name: "Agents",
        url: "/agents",
      },
      {
        Icon: PromptIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/agent-instructions#prompt-blocks",
          label: "Prompts documentation",
        },
        isOnMastraPlatform: true,
        name: "Prompts",
        url: "/prompts",
      },
      {
        Icon: WorkflowIcon,
        docs: {
          href: "https://mastra.ai/en/docs/workflows/overview",
          label: "Workflows documentation",
        },
        isOnMastraPlatform: true,
        name: "Workflows",
        url: "/workflows",
      },
      {
        Icon: ProcessorIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/processors",
          label: "Processors documentation",
        },
        isOnMastraPlatform: false,
        name: "Processors",
        url: "/processors",
      },
      {
        Icon: McpServerIcon,
        docs: {
          href: "https://mastra.ai/en/docs/tools-mcp/mcp-overview",
          label: "MCP documentation",
        },
        isOnMastraPlatform: true,
        name: "MCP Servers",
        url: "/mcps",
      },
      {
        Icon: ToolsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/agents/using-tools-and-mcp",
          label: "Tools documentation",
        },
        isOnMastraPlatform: true,
        name: "Tools",
        url: "/tools",
      },
      {
        Icon: WorkspacesIcon,
        docs: {
          href: "https://mastra.ai/en/docs/workspace/overview",
          label: "Workspaces documentation",
        },
        isOnMastraPlatform: true,
        name: "Workspaces",
        url: "/workspaces",
      },
      {
        Icon: RequestContextIcon,
        isOnMastraPlatform: true,
        name: "Request Context",
        url: "/request-context",
      },
    ],
    key: "primitives",
    title: "Primitives",
  },
  {
    items: [
      {
        Icon: HomeIcon,
        isOnMastraPlatform: true,
        name: "Overview",
        url: "/evaluation",
      },
      {
        Icon: ScorersIcon,
        docs: { href: "https://mastra.ai/en/docs/evals/overview", label: "Scorers documentation" },
        isOnMastraPlatform: true,
        name: "Scorers",
        url: "/scorers",
      },
      {
        Icon: DatasetsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/evals/datasets/overview",
          label: "Datasets documentation",
        },
        isOnMastraPlatform: true,
        name: "Datasets",
        url: "/datasets",
      },
      {
        Icon: ExperimentsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/evals/datasets/running-experiments",
          label: "Experiments documentation",
        },
        isOnMastraPlatform: true,
        name: "Experiments",
        url: "/experiments",
      },
    ],
    key: "evaluation",
    title: "Evaluation",
  },
  {
    items: [
      {
        Icon: MetricsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/observability/overview",
          label: "Metrics documentation",
        },
        isOnMastraPlatform: true,
        name: "Metrics",
        url: "/metrics",
      },
      {
        Icon: TraceIcon,
        activePaths: ["/traces"],
        docs: {
          href: "https://mastra.ai/en/docs/observability/tracing/overview",
          label: "Traces documentation",
        },
        isOnMastraPlatform: true,
        name: "Traces",
        url: "/observability",
      },
      {
        Icon: LogsIcon,
        docs: {
          href: "https://mastra.ai/en/docs/observability/logging",
          label: "Logs documentation",
        },
        isOnMastraPlatform: true,
        name: "Logs",
        url: "/logs",
      },
    ],
    key: "observability",
    title: "Observability",
  },
];

export const bottomNav: NavItem[] = [
  { Icon: SettingsIcon, isOnMastraPlatform: false, name: "Settings", url: "/settings" },
  { Icon: BookIcon, isOnMastraPlatform: true, name: "Resources", url: "/resources" },
];

/** Section-level entries used to resolve breadcrumb label + icon for the overview routes. */
export const sectionNav: NavItem[] = [
  {
    Icon: ExperimentsIcon,
    docs: { href: "https://mastra.ai/en/docs/evals/overview", label: "Evaluation documentation" },
    name: "Evaluation",
    url: "/evaluation",
  },
];

// sectionNav comes first so /evaluation resolves to "Evaluation" (section crumb) rather than the
// in-section "Overview" NavLink which shares the same url.
const allItems: NavItem[] = [...sectionNav, ...mainNav.flatMap((s) => s.items), ...bottomNav];

export function findNavItem(url: string): NavItem | undefined {
  return allItems.find((i) => i.url === url);
}
