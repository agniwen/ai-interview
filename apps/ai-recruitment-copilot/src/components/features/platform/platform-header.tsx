"use client";

import { useRouterState } from "@tanstack/react-router";
import { SidebarInsetHeader } from "@/components/layout/app-sidebar/sidebar-inset-header";
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
  { meta: { title: "所有工作区" }, prefix: "/platform/organizations" },
  { meta: { title: "所有用户" }, prefix: "/platform/users" },
  { meta: { title: "队列任务" }, prefix: "/platform/queues" },
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

  return (
    <SidebarInsetHeader
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
