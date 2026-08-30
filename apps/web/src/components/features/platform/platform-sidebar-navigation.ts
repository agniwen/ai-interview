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
  id: string;
  items: PlatformSidebarNavItem[];
  title?: string;
}

export const platformSidebarNavSections: readonly PlatformSidebarNavSection[] = [
  {
    id: "platform-management",
    items: [
      { icon: IconBuilding, path: "/platform/organizations", title: "所有工作区" },
      { icon: IconUsers, path: "/platform/users", title: "所有用户" },
      { icon: IconInbox, path: "/platform/mail-ingest-accounts", title: "邮箱监听" },
      { icon: IconBell, path: "/platform/notifications", title: "飞书通知" },
      { icon: IconListCheck, path: "/platform/queues", title: "队列任务" },
      { icon: IconDatabase, path: "/platform/resume-parse-cache", title: "解析缓存" },
    ],
    title: "平台管理",
  },
  {
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
