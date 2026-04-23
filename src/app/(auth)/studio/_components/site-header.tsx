"use client";

import { CircleHelpIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import type { StudioTourKey } from "@/app/(auth)/studio/_hooks/use-studio-tutorial";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useStudioTutorialContext } from "./studio-tutorial-provider";

interface RouteMeta {
  title: string;
  tour: StudioTourKey;
}

const ROUTE_META: { prefix: string; meta: RouteMeta }[] = [
  { meta: { title: "AI 面试管理", tour: "interviews" }, prefix: "/studio/interviews" },
  { meta: { title: "部门管理", tour: "departments" }, prefix: "/studio/departments" },
  { meta: { title: "面试官管理", tour: "interviewers" }, prefix: "/studio/interviewers" },
  {
    meta: { title: "在招岗位管理", tour: "job-descriptions" },
    prefix: "/studio/job-descriptions",
  },
];

const DEFAULT_META: RouteMeta = { title: "AI 面试管理", tour: "interviews" };

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
  const { title, tour } = resolveRouteMeta(pathname);
  const { startTutorial } = useStudioTutorialContext();

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
        <Button
          className="hidden sm:inline-flex"
          onClick={() => startTutorial(tour)}
          size="sm"
          variant="ghost"
        >
          <CircleHelpIcon className="size-4" />
          使用教程
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
