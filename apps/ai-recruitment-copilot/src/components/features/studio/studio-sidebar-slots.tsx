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
  UserIcon,
  UserCircleIcon,
  UserCogIcon,
  UsersIcon,
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
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import type { statement } from "@arc/shared/permissions";

interface NavItem {
  /** Path under /w/[slug]/studio — leading slash, no slug prefix. */
  path: string;
  icon: typeof BotIcon;
  title: string;
  /** 仅当 (resource, action) 通过 useHasPermission 时显示。未声明则总是可见。 */
  resource?: keyof typeof statement;
  action?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      {
        action: "read",
        icon: UsersIcon,
        path: "/studio/resumes",
        resource: "resume",
        title: "简历库",
      },
      {
        action: "read",
        icon: LayoutGridIcon,
        path: "/studio/resume-pool",
        resource: "resume",
        title: "简历广场",
      },
      {
        action: "read",
        icon: BotIcon,
        path: "/studio/interviews",
        resource: "interview",
        title: "AI 面试",
      },
      {
        action: "read",
        icon: ChartNoAxesCombinedIcon,
        path: "/studio/dashboard",
        resource: "resume",
        title: "数据看板",
      },
    ],
    label: "工作台",
  },
  {
    items: [
      {
        action: "read",
        icon: Building2Icon,
        path: "/studio/departments",
        resource: "department",
        title: "部门管理",
      },
      {
        action: "read",
        icon: UserCircleIcon,
        path: "/studio/interviewers",
        resource: "interviewer",
        title: "面试官管理",
      },
      {
        action: "read",
        icon: FileTextIcon,
        path: "/studio/job-descriptions",
        resource: "jd",
        title: "在招岗位管理",
      },
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        action: "read",
        icon: ClipboardListIcon,
        path: "/studio/forms",
        resource: "candidateForm",
        title: "面试表单",
      },
      {
        action: "read",
        icon: ListChecksIcon,
        path: "/studio/interview-questions",
        resource: "questionTemplate",
        title: "面试题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        icon: UserIcon,
        path: "/studio/me",
        title: "我的信息",
      },
      {
        icon: UserCogIcon,
        path: "/studio/members",
        title: "工作区管理",
      },
      {
        icon: MailCheckIcon,
        path: "/studio/mail-ingest-accounts",
        title: "邮箱监听",
      },
      {
        action: "read",
        icon: SettingsIcon,
        path: "/studio/global-config",
        resource: "globalConfig",
        title: "系统设置",
      },
    ],
    label: "系统配置",
  },
];

type AnyAction = (typeof statement)[keyof typeof statement][number];

function SidebarNavItem({ item, active, href }: { item: NavItem; active: boolean; href: string }) {
  // Hook must be called unconditionally
  const allowed = useHasPermission(
    (item.resource ?? "interview") as keyof typeof statement,
    (item.action ?? "read") as AnyAction,
  );

  // Items without resource declared are always visible.
  if (item.resource && !allowed) {
    return null;
  }

  const Icon = item.icon;
  return (
    <SidebarMenuItem key={item.path}>
      <SidebarMenuButton asChild className="cursor-default" isActive={active} tooltip={item.title}>
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
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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
