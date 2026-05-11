"use client";

import {
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  SettingsIcon,
  UserCircleIcon,
  UserCogIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
} from "@/components/app-sidebar/portals";
import { SidebarUserSection } from "@/components/sidebar-user-section";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/client/auth-client";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";

interface NavItem {
  /** Path under /w/[slug]/studio — leading slash, no slug prefix. */
  path: string;
  icon: typeof BotIcon;
  title: string;
  /** 仅 better-auth 角色为 admin 时可见。 / Only visible when role === "admin". */
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      {
        icon: BotIcon,
        path: "/studio/interviews",
        title: "AI 面试",
      },
    ],
    label: "工作台",
  },
  {
    items: [
      {
        icon: Building2Icon,
        path: "/studio/departments",
        title: "部门管理",
      },
      {
        icon: UserCircleIcon,
        path: "/studio/interviewers",
        title: "面试官管理",
      },
      {
        icon: FileTextIcon,
        path: "/studio/job-descriptions",
        title: "在招岗位管理",
      },
    ],
    label: "招聘配置",
  },
  {
    items: [
      {
        icon: ClipboardListIcon,
        path: "/studio/forms",
        title: "面试表单",
      },
      {
        icon: ListChecksIcon,
        path: "/studio/interview-questions",
        title: "面试题",
      },
    ],
    label: "题库",
  },
  {
    items: [
      {
        icon: UserCogIcon,
        path: "/studio/members",
        title: "成员管理",
      },
      {
        adminOnly: true,
        icon: UserCogIcon,
        path: "/studio/system-management",
        title: "用户管理",
      },
      {
        icon: SettingsIcon,
        path: "/studio/global-config",
        title: "全局配置",
      },
    ],
    label: "系统配置",
  },
];

export function StudioSidebarSlots() {
  const pathname = usePathname();
  const params = useParams<{ slug?: string }>();
  const slug = params?.slug;
  const { state } = useSidebar();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  // 把 nav 表里的 /studio/* 路径包成当前 workspace 的 /w/[slug]/studio/* 链接；
  // 没有 slug (理论上 StudioSidebarSlots 只在 workspace 路由下渲染) 时退回根路径,
  // 让 / 页面再解析活跃 workspace。
  const buildHref = (path: string): string => (slug ? `/w/${slug}${path}` : path);
  const isActive = (path: string) => {
    const href = buildHref(path);
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <SidebarBodyPortalContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <WorkspaceSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const href = buildHref(item.path);

                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.path)}
                        tooltip={item.title}
                      >
                        <Link href={href}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
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
          callbackURL={buildHref("/studio")}
          collapsed={state === "collapsed"}
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
