"use client";

import {
  IconActivity,
  IconBell,
  IconBook,
  IconBraces,
  IconBuilding,
  IconChartBar,
  IconChartLine,
  IconDatabase,
  IconFilter,
  IconFlask,
  IconFolderCode,
  IconGauge,
  IconGitBranch,
  IconInbox,
  IconListCheck,
  IconLogs,
  IconPlugConnected,
  IconPrompt,
  IconRobot,
  IconSettings,
  IconTool,
  IconUsers,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { PlatformSidebarTabs, resolvePlatformSidebarTab } from "./platform-sidebar-tabs";

interface NavItem {
  path: string;
  icon: typeof IconBuilding;
  title: string;
  activePaths?: string[];
}

interface NavSection {
  items: NavItem[];
  title?: string;
}

const manageNavSections: NavSection[] = [
  {
    items: [
      {
        icon: IconBuilding,
        path: "/platform/organizations",
        title: "所有工作区",
      },
      {
        icon: IconUsers,
        path: "/platform/users",
        title: "所有用户",
      },
      {
        icon: IconInbox,
        path: "/platform/mail-ingest-accounts",
        title: "邮箱监听",
      },
      {
        icon: IconBell,
        path: "/platform/notifications",
        title: "飞书通知",
      },
      {
        icon: IconListCheck,
        path: "/platform/queues",
        title: "队列任务",
      },
    ],
    title: "平台管理",
  },
];

// Keep this lightweight host projection aligned with upstream navigation. Importing
// the playground registry here would pull Studio UI into every Platform page.
const mastraNavSections: NavSection[] = [
  {
    items: [
      { icon: IconRobot, path: "/platform/mastra-studio/agents", title: "Agents" },
      { icon: IconPrompt, path: "/platform/mastra-studio/prompts", title: "Prompts" },
      {
        icon: IconGitBranch,
        path: "/platform/mastra-studio/workflows",
        title: "Workflows",
      },
      {
        icon: IconFilter,
        path: "/platform/mastra-studio/processors",
        title: "Processors",
      },
      {
        icon: IconPlugConnected,
        path: "/platform/mastra-studio/mcps",
        title: "MCP Servers",
      },
      { icon: IconTool, path: "/platform/mastra-studio/tools", title: "Tools" },
      {
        icon: IconFolderCode,
        path: "/platform/mastra-studio/workspaces",
        title: "Workspaces",
      },
      {
        icon: IconBraces,
        path: "/platform/mastra-studio/request-context",
        title: "Request Context",
      },
    ],
    title: "Primitives",
  },
  {
    items: [
      {
        icon: IconChartBar,
        path: "/platform/mastra-studio/evaluation",
        title: "Overview",
      },
      { icon: IconGauge, path: "/platform/mastra-studio/scorers", title: "Scorers" },
      { icon: IconDatabase, path: "/platform/mastra-studio/datasets", title: "Datasets" },
      { icon: IconFlask, path: "/platform/mastra-studio/experiments", title: "Experiments" },
    ],
    title: "Evaluation",
  },
  {
    items: [
      { icon: IconChartLine, path: "/platform/mastra-studio/metrics", title: "Metrics" },
      {
        activePaths: ["/platform/mastra-studio/traces"],
        icon: IconActivity,
        path: "/platform/mastra-studio/observability",
        title: "Traces",
      },
      { icon: IconLogs, path: "/platform/mastra-studio/logs", title: "Logs" },
    ],
    title: "Observability",
  },
  {
    items: [
      { icon: IconSettings, path: "/platform/mastra-studio/settings", title: "Settings" },
      { icon: IconBook, path: "/platform/mastra-studio/resources", title: "Resources" },
    ],
  },
];

export function PlatformSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { state } = useSidebar();
  const activeTab = resolvePlatformSidebarTab(pathname);
  const navSections = activeTab === "mastra" ? mastraNavSections : manageNavSections;

  const isActive = (item: NavItem) => {
    const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
    return matches(item.path) || item.activePaths?.some(matches) === true;
  };

  return (
    <>
      <SidebarHeaderPortalContent>
        <PlatformSidebarTabs />
      </SidebarHeaderPortalContent>

      <SidebarBodyPortalContent>
        {navSections.map((section, index) => (
          <SidebarGroup key={section.title ?? `bottom-${index}`}>
            {section.title ? <SidebarGroupLabel>{section.title}</SidebarGroupLabel> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive(item)}
                        render={
                          <Link to={item.path}>
                            <Icon />
                            <span>{item.title}</span>
                          </Link>
                        }
                        tooltip={item.title}
                      />
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL="/platform/organizations"
          collapsed={state === "collapsed"}
          showHomeLink={true}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
