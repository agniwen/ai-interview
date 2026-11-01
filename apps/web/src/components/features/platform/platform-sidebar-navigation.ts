import {
  IconBell,
  IconBuilding,
  IconDatabase,
  IconGauge,
  IconInbox,
  IconListCheck,
  IconRadio,
  IconServer,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

type NavIcon = ComponentType<{ className?: string }>;

export interface PlatformSidebarNavItem {
  activePaths?: string[];
  icon: NavIcon;
  path: string;
  title: string;
}

export interface PlatformSidebarNavSection {
  /** 包屑中拼在页面名前的分组名，如「LiveKit · 服务概览」。Breadcrumb prefix for the section's pages. */
  breadcrumbPrefix?: string;
  id: string;
  items: PlatformSidebarNavItem[];
  title?: string;
}

export const platformSidebarNavSections: readonly PlatformSidebarNavSection[] = [
  {
    id: "platform-management",
    items: [
      { icon: IconBuilding, path: "/platform/organizations", title: "工作区管理" },
      { icon: IconUsers, path: "/platform/users", title: "用户管理" },
      { icon: IconInbox, path: "/platform/mail-ingest-accounts", title: "邮箱监听" },
      { icon: IconBell, path: "/platform/notifications", title: "飞书通知" },
      { icon: IconListCheck, path: "/platform/queues", title: "队列任务" },
      { icon: IconDatabase, path: "/platform/resume-parse-cache", title: "解析缓存" },
    ],
    title: "平台管理",
  },
  {
    breadcrumbPrefix: "LiveKit",
    id: "livekit",
    items: [
      { icon: IconServer, path: "/platform/livekit/overview", title: "服务概览" },
      { icon: IconRadio, path: "/platform/livekit/rooms", title: "实时房间" },
      { icon: IconGauge, path: "/platform/livekit/metrics", title: "运行指标" },
    ],
    title: "LiveKit",
  },
];

function matchesNavItem(pathname: string, item: PlatformSidebarNavItem): boolean {
  const matches = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  return matches(item.path) || item.activePaths?.some(matches) === true;
}

export function resolvePlatformSidebarNavItem(
  pathname: string,
): PlatformSidebarNavItem | undefined {
  return platformSidebarNavSections
    .flatMap((section) => section.items)
    .find((item) => matchesNavItem(pathname, item));
}

export interface PlatformPageMeta {
  breadcrumbTitle: string;
  icon?: NavIcon;
  /** 页面大标题；未匹配导航项时为 null。Page heading; null when no nav item matches. */
  pageTitle: string | null;
}

const DEFAULT_BREADCRUMB_TITLE = "平台管理";

/**
 * 侧边栏导航是平台页面名称的唯一来源：导航、包屑和页面标题都从这里解析。
 * The sidebar nav is the single source of platform page names for nav, breadcrumb and heading.
 */
export function resolvePlatformPageMeta(pathname: string): PlatformPageMeta {
  for (const section of platformSidebarNavSections) {
    const item = section.items.find((navItem) => matchesNavItem(pathname, navItem));
    if (item) {
      return {
        breadcrumbTitle: section.breadcrumbPrefix
          ? `${section.breadcrumbPrefix} · ${item.title}`
          : item.title,
        icon: item.icon,
        pageTitle: item.title,
      };
    }
  }
  return { breadcrumbTitle: DEFAULT_BREADCRUMB_TITLE, pageTitle: null };
}
