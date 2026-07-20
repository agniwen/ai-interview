"use client";

import {
  IconBell,
  IconBuilding,
  IconDatabase,
  IconInbox,
  IconListCheck,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { useKeyboardShortcutLabel } from "@mastra/playground-ui/hooks/use-keyboard-shortcut-label";
import { Link, useRouterState } from "@tanstack/react-router";
import type { NavIcon } from "@/components/features/mastra-studio/upstream/lib/nav/nav-items";
import { bottomNav, mainNav } from "@/components/features/mastra-studio/upstream/lib/nav/nav-items";
import { useNavigationCommand } from "@/components/features/mastra-studio/upstream/lib/command";
import { addMastraStudioBase } from "@/components/features/mastra-studio/router/studio-route-path";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
  SidebarHeaderPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { Kbd } from "@/components/ui/kbd";
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
  icon: NavIcon;
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
      {
        icon: IconDatabase,
        path: "/platform/resume-parse-cache",
        title: "解析缓存",
      },
    ],
    title: "平台管理",
  },
];

const mastraNavSections: NavSection[] = [
  ...mainNav.map((section) => ({
    items: section.items
      .filter((item) => !item.hidden)
      .map((item) => ({
        activePaths: item.activePaths?.map(addMastraStudioBase),
        icon: item.Icon,
        path: addMastraStudioBase(item.url),
        title: item.name,
      })),
    title: section.title,
  })),
  {
    items: bottomNav
      .filter((item) => !item.hidden)
      .map((item) => ({
        activePaths: item.activePaths?.map(addMastraStudioBase),
        icon: item.Icon,
        path: addMastraStudioBase(item.url),
        title: item.name,
      })),
  },
];

function MastraSidebarSearch() {
  const { setOpen } = useNavigationCommand({ enableShortcut: false });
  const commandShortcutLabel = useKeyboardShortcutLabel("K");
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-label="搜索并导航"
          className="cursor-default select-none transition-[width,height,padding,background-color,border-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          onClick={() => setOpen(true)}
          size="default"
          tooltip="搜索"
          // Expanded: outline “search field” look. Collapsed: plain icon like other nav items.
          variant={collapsed ? "default" : "outline"}
        >
          <IconSearch />
          <span className="group-data-[collapsible=icon]:hidden">搜索</span>
          <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">{commandShortcutLabel}</Kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

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
        {activeTab === "mastra" ? <MastraSidebarSearch /> : null}
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
                        className="cursor-default select-none transition-[width,height,padding,background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] data-[active=false]:opacity-90 data-[active=false]:hover:opacity-100 motion-reduce:transition-none motion-reduce:active:scale-100"
                        isActive={isActive(item)}
                        render={
                          <Link to={item.path}>
                            <Icon />
                            <span>{item.title}</span>
                          </Link>
                        }
                        size="default"
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
