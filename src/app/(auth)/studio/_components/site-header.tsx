"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface RouteMeta {
  title: string;
}

const ROUTE_META: { prefix: string; meta: RouteMeta }[] = [
  { meta: { title: "简历库" }, prefix: "/studio/interviews" },
  { meta: { title: "部门管理" }, prefix: "/studio/departments" },
  { meta: { title: "面试官管理" }, prefix: "/studio/interviewers" },
  { meta: { title: "在招岗位管理" }, prefix: "/studio/job-descriptions" },
  { meta: { title: "面试表单" }, prefix: "/studio/forms" },
  { meta: { title: "面试题" }, prefix: "/studio/interview-questions" },
  { meta: { title: "全局配置" }, prefix: "/studio/global-config" },
];

const DEFAULT_META: RouteMeta = { title: "简历库" };

function resolveRouteMeta(pathname: string): RouteMeta {
  for (const { prefix, meta } of ROUTE_META) {
    if (pathname.startsWith(prefix)) {
      return meta;
    }
  }

  return DEFAULT_META;
}

export function SiteHeader() {
  const pathname = usePathname();
  const { title } = resolveRouteMeta(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-sidebar border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mx-2 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">Studio</BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  );
}
