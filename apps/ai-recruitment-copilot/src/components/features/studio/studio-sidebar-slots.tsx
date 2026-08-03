"use client";

import {
  IconBuilding,
  IconCalendarEvent,
  IconChartBar,
  IconClipboardList,
  IconFileText,
  IconLayoutGrid,
  IconListCheck,
  IconMailCheck,
  IconMessageChatbot,
  IconRobot,
  IconShieldCheck,
  IconUser,
  IconUserCircle,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { SidebarBodyPortalContent } from "@/components/layout/app-sidebar/portals";
import { SidebarSlotTransition } from "@/components/layout/app-sidebar/sidebar-slot-transition";
import type { SidebarSlotDirection } from "@/components/layout/app-sidebar/sidebar-slot-transition";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { statement } from "@arc/shared/permissions";

export interface NavItem {
  /** Path under /w/[slug]/studio — leading slash, no slug prefix. */
  path: string;
  icon: typeof IconRobot;
  title: string;
  /** 仅当 page action 通过 useHasPermission 时显示。 */
  action: (typeof statement)["page"][number];
  adminOnly?: boolean;
  resource: "page";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      {
        action: "resumes",
        icon: IconUsers,
        path: "/studio/resumes",
        resource: "page",
        title: "招聘",
      },
      {
        action: "resumePool",
        icon: IconLayoutGrid,
        path: "/studio/resume-pool",
        resource: "page",
        title: "人才库",
      },
      {
        action: "interviews",
        icon: IconRobot,
        path: "/studio/interviews",
        resource: "page",
        title: "AI 面试",
      },
      {
        action: "interviews",
        icon: IconCalendarEvent,
        path: "/studio/calendar",
        resource: "page",
        title: "日程管理",
      },
      {
        action: "dashboard",
        icon: IconChartBar,
        path: "/studio/dashboard",
        resource: "page",
        title: "数据看板",
      },
    ],
    label: "工作台",
  },
  {
    items: [
      {
        action: "departments",
        icon: IconBuilding,
        path: "/studio/departments",
        resource: "page",
        title: "部门管理",
      },
      {
        action: "interviewers",
        icon: IconUserCircle,
        path: "/studio/interviewers",
        resource: "page",
        title: "面试官管理",
      },
      {
        action: "jobDescriptions",
        icon: IconFileText,
        path: "/studio/job-descriptions",
        resource: "page",
        title: "岗位设置",
      },
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        action: "forms",
        icon: IconClipboardList,
        path: "/studio/forms",
        resource: "page",
        title: "表单题",
      },
      {
        action: "interviewQuestions",
        icon: IconListCheck,
        path: "/studio/interview-questions",
        resource: "page",
        title: "沟通题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        action: "me",
        icon: IconUser,
        path: "/studio/me",
        resource: "page",
        title: "我的信息",
      },
      {
        action: "members",
        icon: IconUserCog,
        path: "/studio/members",
        resource: "page",
        title: "工作区管理",
      },
      {
        action: "mailIngestAccounts",
        icon: IconMailCheck,
        path: "/studio/mail-ingest-accounts",
        resource: "page",
        title: "邮箱监听",
      },
      {
        action: "permissions",
        icon: IconShieldCheck,
        path: "/studio/permissions",
        resource: "page",
        title: "权限管理",
      },
      {
        action: "globalConfig",
        icon: IconMessageChatbot,
        path: "/studio/global-config",
        resource: "page",
        title: "上下文设置",
      },
    ],
    label: "系统配置",
  },
];

const WORKSPACE_PREFIX_REGEX = /^\/w\/[^/]+/;

export function resolveStudioSidebarNavItem(pathname: string): NavItem | undefined {
  const studioPath = pathname.replace(WORKSPACE_PREFIX_REGEX, "");
  return navGroups
    .flatMap((group) => group.items)
    .find((item) => studioPath === item.path || studioPath.startsWith(`${item.path}/`));
}

function SidebarNavItem({ item, active, href }: { item: NavItem; active: boolean; href: string }) {
  // Hook must be called unconditionally
  const allowed = useHasPermission(item.resource, item.action);
  const memberRole = useWorkspaceMemberRole();

  if (!allowed || (item.adminOnly && memberRole !== "owner" && memberRole !== "admin")) {
    return null;
  }

  const Icon = item.icon;
  return (
    <SidebarMenuItem key={item.path}>
      <SidebarMenuButton
        className="cursor-default select-none transition-[width,height,padding,background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] data-[active=false]:opacity-90 data-[active=false]:hover:opacity-100 motion-reduce:transition-none motion-reduce:active:scale-100"
        isActive={active}
        render={
          <Link to={href}>
            <Icon />
            <span>{item.title}</span>
          </Link>
        }
        tooltip={item.title}
      />
    </SidebarMenuItem>
  );
}

function StudioSidebarNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const slug = useWorkspaceSlug();

  // 把 nav 表里的 /studio/* 路径包成当前 workspace 的 /w/[slug]/studio/* 链接；
  // 没有 slug (理论上 StudioSidebarSlots 只在 workspace 路由下渲染) 时退回根路径,
  // 让 / 页面再解析活跃 workspace。
  const buildHref = (path: string): string => (slug ? `/w/${slug}${path}` : path);
  const isActive = (path: string) => {
    const href = buildHref(path);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return navGroups.map((group) => (
    <SidebarGroup className="hidden has-[[data-sidebar=menu-item]]:flex" key={group.label}>
      <SidebarGroupLabel className="select-none">{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarNavItem
              key={item.path}
              item={item}
              active={isActive(item.path)}
              href={buildHref(item.path)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}

export function StudioSidebarSlots({
  active,
  direction,
}: {
  active: boolean;
  direction: SidebarSlotDirection;
}) {
  return (
    <SidebarBodyPortalContent>
      <SidebarSlotTransition active={active} direction={direction} panelKey="studio-sidebar-body">
        <StudioSidebarNavigation />
      </SidebarSlotTransition>
    </SidebarBodyPortalContent>
  );
}
