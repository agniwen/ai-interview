"use client";

import { useRouterState } from "@tanstack/react-router";
import { SidebarInsetHeader } from "@/components/layout/app-sidebar/sidebar-inset-header";
import { resolvePlatformSidebarNavItem } from "./platform-sidebar-slots";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface RouteMeta {
  title: string;
}

const ROUTE_META: { prefix: string; meta: RouteMeta }[] = [
  { meta: { title: "LiveKit · 服务概览" }, prefix: "/platform/livekit/overview" },
  { meta: { title: "LiveKit · 实时房间" }, prefix: "/platform/livekit/rooms" },
  { meta: { title: "LiveKit · 运行指标" }, prefix: "/platform/livekit/metrics" },
  { meta: { title: "所有工作区" }, prefix: "/platform/organizations" },
  { meta: { title: "所有用户" }, prefix: "/platform/users" },
  { meta: { title: "邮箱监听" }, prefix: "/platform/mail-ingest-accounts" },
  { meta: { title: "飞书通知" }, prefix: "/platform/notifications" },
  { meta: { title: "队列任务" }, prefix: "/platform/queues" },
  { meta: { title: "解析缓存" }, prefix: "/platform/resume-parse-cache" },
  { meta: { title: "Mastra Studio" }, prefix: "/platform/mastra-studio" },
];

const DEFAULT_META: RouteMeta = { title: "平台管理" };

function resolveRouteMeta(pathname: string): RouteMeta {
  for (const { prefix, meta } of ROUTE_META) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return meta;
    }
  }
  return DEFAULT_META;
}

export function PlatformHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { title } = resolveRouteMeta(pathname);
  const ActiveMenuIcon = resolvePlatformSidebarNavItem(pathname)?.icon;

  return (
    <SidebarInsetHeader
      activeMenuIcon={ActiveMenuIcon ? <ActiveMenuIcon /> : undefined}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">Platform</BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  );
}
