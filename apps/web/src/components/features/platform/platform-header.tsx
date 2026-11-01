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
import { resolvePlatformPageMeta } from "./platform-sidebar-navigation";

export function PlatformHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { breadcrumbTitle, icon: ActiveMenuIcon } = resolvePlatformPageMeta(pathname);

  return (
    <SidebarInsetHeader
      activeMenuIcon={ActiveMenuIcon ? <ActiveMenuIcon /> : undefined}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">Platform</BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{breadcrumbTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  );
}
