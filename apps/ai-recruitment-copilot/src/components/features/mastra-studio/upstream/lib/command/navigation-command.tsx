import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandShortcut,
} from "@mastra/playground-ui/components/Command";
import { Kbd } from "@mastra/playground-ui/components/Kbd";
import { useMaybeSidebar } from "@mastra/playground-ui/components/MainSidebar";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { useKeyboardShortcutLabel } from "@mastra/playground-ui/hooks/use-keyboard-shortcut-label";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { McpServerIcon } from "@mastra/playground-ui/icons/McpServerIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import {
  Cpu,
  EyeIcon,
  GaugeIcon,
  Layers3Icon,
  PackageIcon,
  PanelLeftIcon,
  RouteIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import React from "react";

import { NavigationCommandItem } from "./navigation-command-item";
import { useNavigationCommand } from "./use-navigation-command";
import { useAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agents";
import { usePermissions } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-permissions";
import {
  getPermissionForRoute,
  hasRoutePermission,
} from "@/components/features/mastra-studio/upstream/domains/auth/route-permissions";
import { useIsCmsAvailable } from "@/components/features/mastra-studio/upstream/domains/cms/hooks/use-is-cms-available";
import { useMCPServers } from "@/components/features/mastra-studio/upstream/domains/mcps/hooks/use-mcp-servers";
import { useProcessors } from "@/components/features/mastra-studio/upstream/domains/processors/hooks/use-processors";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { useTools } from "@/components/features/mastra-studio/upstream/domains/tools/hooks/use-all-tools";
import { useWorkflows } from "@/components/features/mastra-studio/upstream/domains/workflows/hooks/use-workflows";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { useMastraPlatform } from "@/components/features/mastra-studio/upstream/lib/mastra-platform";
import { bottomNav, mainNav } from "@/components/features/mastra-studio/upstream/lib/nav/nav-items";
import type { NavItem } from "@/components/features/mastra-studio/upstream/lib/nav/nav-items";
import { cn } from "@/components/features/mastra-studio/upstream/lib/utils";

import "./navigation-command.css";

type CommandScope =
  | "all"
  | "paths"
  | "agents"
  | "workflows"
  | "tooling"
  | "evaluation"
  | "observability"
  | "settings";

interface ScopeOption {
  id: CommandScope;
  label: string;
  icon: React.ReactNode;
  count: number;
}

const scopeButtonClassName =
  "flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 text-left text-ui-smd leading-ui-sm text-neutral3 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-border1 hover:bg-surface4 hover:text-neutral6 active:scale-[0.99] data-[active=true]:border-border1 data-[active=true]:bg-surface4 data-[active=true]:text-neutral6";

const ScopeButton = ({
  option,
  activeScope,
  onSelect,
}: {
  option: ScopeOption;
  activeScope: CommandScope;
  onSelect: () => void;
}) => (
  <button
    type="button"
    className={scopeButtonClassName}
    data-active={activeScope === option.id}
    onClick={onSelect}
  >
    <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
      {option.icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{option.label}</span>
    <span className="rounded-md border border-border1 bg-surface4/70 px-1.5 py-0.5 text-[10px] leading-none text-neutral3">
      {option.count}
    </span>
  </button>
);

function getRouteValue(item: NavItem, sectionTitle?: string) {
  return [item.name, item.url, sectionTitle, item.docs?.label, "页面 path route navigate"]
    .filter(Boolean)
    .join(" ");
}

function getRouteBadge(sectionTitle?: string) {
  if (!sectionTitle || sectionTitle === "Studio") {
    return "页面";
  }
  return sectionTitle;
}

function getObservabilityEntityPath(entity: string) {
  return `/observability?entity=${encodeURIComponent(entity)}`;
}

interface NavigationSection {
  key: string;
  title: string;
  items: NavItem[];
}

type NavigationPaths = ReturnType<typeof useLinkComponent>["paths"];
type SidebarContextValue = NonNullable<ReturnType<typeof useMaybeSidebar>>;
type HandleSelect = (path: string) => void;
type AgentEntry = [string, { name: string }];
type WorkflowEntry = [string, { name: string }];
type ToolEntry = [string, { id: string }];
interface ProcessorEntry {
  id: string;
  name?: string;
  isWorkflow?: boolean;
}
interface McpServerEntry {
  id: string;
  name: string;
}
type ScorerEntry = [
  string,
  {
    scorer?: {
      config?: {
        id?: string;
        name?: string;
      };
    };
  },
];

const CommandRail = ({
  scopeOptions,
  activeScope,
  onScopeChange,
}: {
  scopeOptions: ScopeOption[];
  activeScope: CommandScope;
  onScopeChange: (scope: CommandScope) => void;
}) => (
  <aside className="navigation-command-surface navigation-command-surface-rail flex min-h-0 max-h-[min(14rem,32dvh)] flex-col overflow-hidden rounded-2xl border border-border1 bg-surface2 p-3 shadow-[0_8px_24px_-20px_rgb(0_0_0_/_0.55)] md:h-full md:max-h-none">
    <ScrollArea className="-m-1 min-h-0 flex-1 p-1" viewPortClassName="pr-1">
      <div className="flex flex-col gap-1">
        {scopeOptions.map((option) => (
          <ScopeButton
            key={option.id}
            option={option}
            activeScope={activeScope}
            onSelect={() => onScopeChange(option.id)}
          />
        ))}
      </div>
    </ScrollArea>
  </aside>
);

const ShortcutResults = ({
  sidebar,
  activeScope,
  sidebarShortcutLabel,
  setOpen,
}: {
  sidebar: SidebarContextValue | null;
  activeScope: CommandScope;
  sidebarShortcutLabel: string;
  setOpen: (open: boolean) => void;
}) => {
  if (!sidebar || (activeScope !== "all" && activeScope !== "settings")) {
    return null;
  }

  return (
    <CommandGroup heading="快捷操作">
      <NavigationCommandItem
        value="toggle sidebar collapse expand layout panel shortcut command b ctrl b"
        onSelect={() => {
          sidebar.toggleSidebar();
          setOpen(false);
        }}
        icon={<PanelLeftIcon />}
        title="切换侧边栏"
        subtitle="Studio 布局"
        badge="快捷键"
        shortcut={
          <CommandShortcut className="flex items-center">
            <Kbd className="text-[10px]">{sidebarShortcutLabel}</Kbd>
          </CommandShortcut>
        }
      />
    </CommandGroup>
  );
};

const PathSectionResults = ({
  sections,
  handleSelect,
}: {
  sections: NavigationSection[];
  handleSelect: HandleSelect;
}) => (
  <>
    {sections.map((section) => (
      <CommandGroup key={section.key} heading={section.title}>
        {section.items.map((item) => {
          const { Icon } = item;
          return (
            <NavigationCommandItem
              key={item.url}
              value={getRouteValue(item, section.title)}
              onSelect={() => handleSelect(item.url)}
              icon={<Icon />}
              title={item.name}
              subtitle="Studio 页面"
              path={item.url}
              badge={getRouteBadge(section.title)}
            />
          );
        })}
      </CommandGroup>
    ))}
  </>
);

const AgentResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: AgentEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="智能体">
      {entries.map(([id, agent]) => (
        <NavigationCommandItem
          key={id}
          value={`${agent.name} ${id} chat agent conversation thread ${paths.agentLink(id)}`}
          onSelect={() => handleSelect(paths.agentLink(id))}
          icon={<AgentIcon />}
          title={agent.name}
          subtitle="智能体对话"
          path={paths.agentLink(id)}
          badge="智能体"
        />
      ))}
    </CommandGroup>
  );
};

const WorkflowResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: WorkflowEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="工作流">
      {entries.map(([id, workflow]) => (
        <NavigationCommandItem
          key={id}
          value={`${workflow.name} ${id} graph workflow view ${paths.workflowLink(id)}`}
          onSelect={() => handleSelect(paths.workflowLink(id))}
          icon={<WorkflowIcon />}
          title={workflow.name}
          subtitle="工作流图"
          path={paths.workflowLink(id)}
          badge="工作流"
        />
      ))}
    </CommandGroup>
  );
};

const ToolResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: ToolEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="工具">
      {entries.map(([id, tool]) => (
        <NavigationCommandItem
          key={id}
          value={`tool ${tool.id} ${id} ${paths.toolLink(id)}`}
          onSelect={() => handleSelect(paths.toolLink(id))}
          icon={<ToolsIcon />}
          title={tool.id}
          subtitle="工具定义"
          path={paths.toolLink(id)}
          badge="工具"
        />
      ))}
    </CommandGroup>
  );
};

const ProcessorResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: ProcessorEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="处理器">
      {entries.map((processor) => {
        const displayName = processor.name || processor.id;
        const targetPath = processor.isWorkflow
          ? `${paths.workflowLink(processor.id)}/graph`
          : paths.processorLink(processor.id);
        return (
          <NavigationCommandItem
            key={processor.id}
            value={`processor ${displayName} ${processor.id} ${targetPath}`}
            onSelect={() => handleSelect(targetPath)}
            icon={<Cpu />}
            title={displayName}
            subtitle={processor.isWorkflow ? "工作流处理器" : "处理器"}
            path={targetPath}
            badge="处理器"
          />
        );
      })}
    </CommandGroup>
  );
};

const McpServerResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: McpServerEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="MCP 服务器">
      {entries.map((server) => (
        <NavigationCommandItem
          key={server.id}
          value={`mcp server ${server.name} ${server.id} ${paths.mcpServerLink(server.id)}`}
          onSelect={() => handleSelect(paths.mcpServerLink(server.id))}
          icon={<McpServerIcon />}
          title={server.name}
          subtitle="MCP 服务器"
          path={paths.mcpServerLink(server.id)}
          badge="MCP"
        />
      ))}
    </CommandGroup>
  );
};

const ObservabilityResults = ({
  visible,
  agentEntries,
  workflowEntries,
  handleSelect,
}: {
  visible: boolean;
  agentEntries: AgentEntry[];
  workflowEntries: WorkflowEntry[];
  handleSelect: HandleSelect;
}) => {
  if (!visible) {
    return null;
  }

  return (
    <>
      <CommandGroup heading="可观测性">
        <NavigationCommandItem
          value="observability traces telemetry signals /observability"
          onSelect={() => handleSelect("/observability")}
          icon={<EyeIcon />}
          title="追踪"
          subtitle="运行时追踪"
          path="/observability"
          badge="观测信号"
        />
        <NavigationCommandItem
          value="metrics usage latency performance tokens /metrics"
          onSelect={() => handleSelect("/metrics")}
          icon={<GaugeIcon />}
          title="指标"
          subtitle="运行时指标"
          path="/metrics"
          badge="观测信号"
        />
        <NavigationCommandItem
          value="logs events runtime /logs"
          onSelect={() => handleSelect("/logs")}
          icon={<EyeIcon />}
          title="日志"
          subtitle="运行时日志"
          path="/logs"
          badge="观测信号"
        />
      </CommandGroup>

      {agentEntries.length > 0 && (
        <CommandGroup heading="智能体追踪">
          {agentEntries.map(([id, agent]) => {
            const path = getObservabilityEntityPath(id);

            return (
              <NavigationCommandItem
                key={id}
                value={`${agent.name} ${id} traces agent observability telemetry`}
                onSelect={() => handleSelect(path)}
                icon={<EyeIcon />}
                title={agent.name}
                subtitle="智能体追踪"
                path={path}
                badge="追踪"
              />
            );
          })}
        </CommandGroup>
      )}

      {workflowEntries.length > 0 && (
        <CommandGroup heading="工作流追踪">
          {workflowEntries.map(([id, workflow]) => {
            const path = getObservabilityEntityPath(workflow.name);

            return (
              <NavigationCommandItem
                key={id}
                value={`${workflow.name} ${id} traces workflow observability telemetry`}
                onSelect={() => handleSelect(path)}
                icon={<EyeIcon />}
                title={workflow.name}
                subtitle="工作流追踪"
                path={path}
                badge="追踪"
              />
            );
          })}
        </CommandGroup>
      )}
    </>
  );
};

const EvaluationResults = ({
  visible,
  entries,
  paths,
  handleSelect,
}: {
  visible: boolean;
  entries: ScorerEntry[];
  paths: NavigationPaths;
  handleSelect: HandleSelect;
}) => {
  if (!visible || entries.length === 0) {
    return null;
  }

  return (
    <CommandGroup heading="评分器">
      {entries.map(([id, scorer]) => {
        const name = scorer.scorer?.config?.name || scorer.scorer?.config?.id || id;
        return (
          <NavigationCommandItem
            key={id}
            value={`scorer score evaluation ${name} ${id} ${paths.scorerLink(id)}`}
            onSelect={() => handleSelect(paths.scorerLink(id))}
            icon={<GaugeIcon />}
            title={name}
            subtitle="评估评分器"
            path={paths.scorerLink(id)}
            badge="评分器"
          />
        );
      })}
    </CommandGroup>
  );
};

const CommandFooter = () => (
  <div className="navigation-command-footer pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 px-4 pb-2 pt-5 text-ui-xs text-neutral3">
    <span className="truncate">Studio 搜索</span>
    <span className="flex shrink-0 items-center gap-1.5">
      <Kbd className="min-w-5 px-1 text-[10px]">↑</Kbd>
      <Kbd className="min-w-5 px-1 text-[10px]">↓</Kbd>
      <Kbd className="min-w-5 px-1 text-[10px]">↵</Kbd>
      <Kbd className="min-w-5 px-1 text-[10px]">Esc</Kbd>
    </span>
  </div>
);

export const NavigationCommand = () => {
  const { open, setOpen } = useNavigationCommand({ enableShortcut: false });
  const { navigate, paths } = useLinkComponent();
  const { isMastraPlatform } = useMastraPlatform();
  const sidebar = useMaybeSidebar();
  const sidebarShortcutLabel = useKeyboardShortcutLabel("B");
  const [activeScope, setActiveScope] = React.useState<CommandScope>("all");

  const { data: agents = {} } = useAgents({ enabled: open });
  const { data: workflows = {} } = useWorkflows({ enabled: open });
  const { data: tools = {} } = useTools({ enabled: open });
  const { data: processors = {} } = useProcessors({ enabled: open });
  const { data: mcpServers = [] } = useMCPServers({ enabled: open });
  const { data: scorers = {} } = useScorers({ enabled: open });
  const { isCmsAvailable, isLoading: isCmsLoading } = useIsCmsAvailable({ enabled: open });
  const { hasPermission, hasAnyPermission, isLoading: isPermissionsLoading } = usePermissions();

  React.useEffect(() => {
    if (!open) {
      setActiveScope("all");
    }
  }, [open]);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const filterNavItem = React.useCallback(
    (item: NavItem) => {
      if (item.hidden) {
        return false;
      }
      if (item.url === "/prompts" && !isCmsAvailable && !isCmsLoading) {
        return false;
      }
      if (isMastraPlatform && !item.isOnMastraPlatform) {
        return false;
      }

      const requiredPermission = getPermissionForRoute(item.url);
      if (isPermissionsLoading && requiredPermission && requiredPermission !== "public") {
        return false;
      }

      return hasRoutePermission(requiredPermission, hasPermission, hasAnyPermission);
    },
    [
      hasAnyPermission,
      hasPermission,
      isCmsAvailable,
      isCmsLoading,
      isMastraPlatform,
      isPermissionsLoading,
    ],
  );

  const agentEntries = Object.entries(agents);
  const workflowEntries = Object.entries(workflows);
  const toolEntries = Object.entries(tools);
  const processorEntries = Object.values(processors).filter((p) => p.phases && p.phases.length > 0);
  const scorerEntries = Object.entries(scorers);

  const navigationSections = React.useMemo(() => {
    const sections: NavigationSection[] = [];
    for (const section of mainNav) {
      const items = section.items.filter(filterNavItem);
      if (items.length > 0) {
        sections.push({ items, key: section.key, title: section.title });
      }
    }

    const studioItems: NavItem[] = [
      ...bottomNav.filter(filterNavItem),
      ...(isMastraPlatform
        ? []
        : [
            {
              Icon: PackageIcon,
              isOnMastraPlatform: false,
              name: "模板",
              url: "/templates",
            },
          ]),
    ];

    if (studioItems.length === 0) {
      return sections;
    }
    return [...sections, { items: studioItems, key: "studio", title: "Studio" }];
  }, [filterNavItem, isMastraPlatform]);

  const pathCount = navigationSections.reduce((count, section) => count + section.items.length, 0);
  const toolingCount = toolEntries.length + processorEntries.length + mcpServers.length;
  const evaluationCount = scorerEntries.length;
  const observabilityCount = agentEntries.length + workflowEntries.length + 3;
  const settingsCount =
    navigationSections.find((section) => section.key === "studio")?.items.length ?? 0;
  const allCount =
    pathCount +
    agentEntries.length +
    workflowEntries.length +
    toolingCount +
    evaluationCount +
    observabilityCount;

  const scopeOptions: ScopeOption[] = [
    { count: allCount, icon: <SearchIcon />, id: "all", label: "全部" },
    { count: pathCount, icon: <RouteIcon />, id: "paths", label: "页面" },
    { count: agentEntries.length, icon: <AgentIcon />, id: "agents", label: "智能体" },
    { count: workflowEntries.length, icon: <WorkflowIcon />, id: "workflows", label: "工作流" },
    { count: toolingCount, icon: <Layers3Icon />, id: "tooling", label: "工具体系" },
    { count: evaluationCount, icon: <GaugeIcon />, id: "evaluation", label: "评估" },
    { count: observabilityCount, icon: <EyeIcon />, id: "observability", label: "观测信号" },
    { count: settingsCount, icon: <SlidersHorizontalIcon />, id: "settings", label: "Studio" },
  ];

  const showPaths = activeScope === "all" || activeScope === "paths";
  const showAgents = activeScope === "all" || activeScope === "agents";
  const showWorkflows = activeScope === "all" || activeScope === "workflows";
  const showTooling = activeScope === "all" || activeScope === "tooling";
  const showEvaluation = activeScope === "all" || activeScope === "evaluation";
  const showObservability = activeScope === "all" || activeScope === "observability";
  const showSettings = activeScope === "settings";

  const visiblePathSections = React.useMemo(() => {
    const sections: NavigationSection[] = [];
    for (const section of navigationSections) {
      if (showSettings) {
        if (section.key === "studio") {
          sections.push(section);
        }
        continue;
      }

      const isVisible =
        (activeScope === "evaluation" && section.key === "evaluation") ||
        (activeScope === "observability" && section.key === "observability") ||
        (showPaths && (activeScope === "all" || section.key !== "studio"));

      if (isVisible) {
        sections.push(section);
      }
    }
    return sections;
  }, [activeScope, navigationSections, showPaths, showSettings]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Mastra Studio 搜索"
      description="搜索 Studio 页面和运行时实体"
      showOverlay
      overlayClassName="bg-surface1/40 backdrop-blur-none"
      contentClassName="navigation-command-popup max-w-[min(56rem,calc(100vw-2rem))] overflow-visible border-none bg-transparent p-0 shadow-none backdrop-blur-none sm:max-w-[min(56rem,calc(100vw-2rem))]"
      commandClassName={cn(
        "h-[min(42rem,calc(100dvh-2rem))] min-h-[min(30rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] gap-2 overflow-visible rounded-none bg-transparent text-neutral4 shadow-none backdrop-blur-none",
        "[&_[data-slot=command-input-wrapper]]:h-14 [&_[data-slot=command-input-wrapper]]:shrink-0 [&_[data-slot=command-input-wrapper]]:rounded-xl [&_[data-slot=command-input-wrapper]]:border [&_[data-slot=command-input-wrapper]]:border-border1 [&_[data-slot=command-input-wrapper]]:px-4 [&_[data-slot=command-input-wrapper]]:shadow-[0_6px_18px_-16px_rgb(0_0_0_/_0.55)]",
        "[&_[data-slot=command-input-wrapper]]:pr-11 [&_[data-slot=command-input-wrapper]]:transition-[border-color,box-shadow] [&_[data-slot=command-input-wrapper]]:duration-150 [&_[data-slot=command-input-wrapper]]:ease-out [&_[data-slot=command-input-wrapper]:focus-within]:border-border1 [&_[data-slot=command-input-wrapper]:focus-within]:shadow-[0_8px_22px_-18px_rgb(0_0_0_/_0.6)] [&_[data-slot=command-input-wrapper]_svg]:text-neutral4",
        "**:[[cmdk-input]]:h-full **:[[cmdk-input]]:text-ui-md",
        "**:[[cmdk-group]]:p-0 **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:pb-2 **:[[cmdk-group-heading]]:pt-3",
        "**:[[cmdk-item]]:px-3 **:[[cmdk-item]]:py-2.5",
      )}
    >
      <CommandInput
        placeholder="搜索 Studio、智能体、工作流、工具和页面..."
        wrapperClassName="navigation-command-surface navigation-command-surface-input bg-surface2"
      />

      <div className="min-h-0 flex-1 rounded-2xl">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-none">
          <CommandRail
            scopeOptions={scopeOptions}
            activeScope={activeScope}
            onScopeChange={setActiveScope}
          />

          <div className="navigation-command-surface navigation-command-surface-results navigation-command-results-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border1 bg-surface2 shadow-[0_10px_28px_-22px_rgb(0_0_0_/_0.6)]">
            <CommandList
              scrollArea
              scrollAreaClassName="min-h-0 flex-1 rounded-none"
              scrollAreaViewportClassName="navigation-command-scroll-viewport"
              className="navigation-command-list max-h-none rounded-none border-none bg-transparent shadow-none"
            >
              <CommandEmpty>没有匹配的结果。</CommandEmpty>
              <ShortcutResults
                sidebar={sidebar}
                activeScope={activeScope}
                sidebarShortcutLabel={sidebarShortcutLabel}
                setOpen={setOpen}
              />
              <PathSectionResults sections={visiblePathSections} handleSelect={handleSelect} />
              <AgentResults
                visible={showAgents}
                entries={agentEntries}
                paths={paths}
                handleSelect={handleSelect}
              />
              <WorkflowResults
                visible={showWorkflows}
                entries={workflowEntries}
                paths={paths}
                handleSelect={handleSelect}
              />
              <ToolResults
                visible={showTooling}
                entries={toolEntries}
                paths={paths}
                handleSelect={handleSelect}
              />
              <ProcessorResults
                visible={showTooling}
                entries={processorEntries}
                paths={paths}
                handleSelect={handleSelect}
              />
              <McpServerResults
                visible={showTooling}
                entries={mcpServers}
                paths={paths}
                handleSelect={handleSelect}
              />
              <ObservabilityResults
                visible={showObservability}
                agentEntries={agentEntries}
                workflowEntries={workflowEntries}
                handleSelect={handleSelect}
              />
              <EvaluationResults
                visible={showEvaluation}
                entries={scorerEntries}
                paths={paths}
                handleSelect={handleSelect}
              />
            </CommandList>
            <CommandFooter />
          </div>
        </div>
      </div>
    </CommandDialog>
  );
};
