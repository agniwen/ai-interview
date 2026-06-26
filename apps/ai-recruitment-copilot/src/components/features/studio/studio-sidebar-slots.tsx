"use client";

import {
  ChartNoAxesCombinedIcon,
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MailCheckIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserIcon,
  UserCircleIcon,
  UserCogIcon,
  UsersIcon,
  WrenchIcon,
} from "@/components/icons/hugeicons";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
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
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { statement } from "@arc/shared/permissions";

interface NavItem {
  /** Path under /w/[slug]/studio — leading slash, no slug prefix. */
  path: string;
  icon: typeof BotIcon;
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
        icon: UsersIcon,
        path: "/studio/resumes",
        resource: "page",
        title: "简历库",
      },
      {
        action: "resumePool",
        icon: LayoutGridIcon,
        path: "/studio/resume-pool",
        resource: "page",
        title: "简历广场",
      },
      {
        action: "interviews",
        icon: BotIcon,
        path: "/studio/interviews",
        resource: "page",
        title: "AI 面试",
      },
      {
        action: "dashboard",
        icon: ChartNoAxesCombinedIcon,
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
        icon: Building2Icon,
        path: "/studio/departments",
        resource: "page",
        title: "部门管理",
      },
      {
        action: "interviewers",
        icon: UserCircleIcon,
        path: "/studio/interviewers",
        resource: "page",
        title: "面试官管理",
      },
      {
        action: "jobDescriptions",
        icon: FileTextIcon,
        path: "/studio/job-descriptions",
        resource: "page",
        title: "在招岗位管理",
      },
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        action: "forms",
        icon: ClipboardListIcon,
        path: "/studio/forms",
        resource: "page",
        title: "面试表单",
      },
      {
        action: "interviewQuestions",
        icon: ListChecksIcon,
        path: "/studio/interview-questions",
        resource: "page",
        title: "面试题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        action: "me",
        icon: UserIcon,
        path: "/studio/me",
        resource: "page",
        title: "我的信息",
      },
      {
        action: "members",
        icon: UserCogIcon,
        path: "/studio/members",
        resource: "page",
        title: "工作区管理",
      },
      {
        action: "mailIngestAccounts",
        icon: MailCheckIcon,
        path: "/studio/mail-ingest-accounts",
        resource: "page",
        title: "邮箱监听",
      },
      {
        action: "agentDebug",
        adminOnly: true,
        icon: WrenchIcon,
        path: "/studio/agent-debug",
        resource: "page",
        title: "Agent 调试",
      },
      {
        action: "permissions",
        icon: ShieldCheckIcon,
        path: "/studio/permissions",
        resource: "page",
        title: "权限管理",
      },
      {
        action: "globalConfig",
        icon: SettingsIcon,
        path: "/studio/global-config",
        resource: "page",
        title: "系统设置",
      },
    ],
    label: "系统配置",
  },
];

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
        asChild
        className="cursor-default select-none"
        isActive={active}
        tooltip={item.title}
      >
        <Link to={href}>
          <Icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function StudioSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const slug = useWorkspaceSlug();
  const { state } = useSidebar();

  // 把 nav 表里的 /studio/* 路径包成当前 workspace 的 /w/[slug]/studio/* 链接；
  // 没有 slug (理论上 StudioSidebarSlots 只在 workspace 路由下渲染) 时退回根路径,
  // 让 / 页面再解析活跃 workspace。
  const buildHref = (path: string): string => (slug ? `/w/${slug}${path}` : path);
  const isActive = (path: string) => {
    const href = buildHref(path);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <SidebarBodyPortalContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
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
        ))}
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL={buildHref("/studio")}
          collapsed={state === "collapsed"}
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
