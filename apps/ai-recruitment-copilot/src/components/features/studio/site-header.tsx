"use client";

import { useRouterState } from "@tanstack/react-router";
import { SidebarInsetHeader } from "@/components/layout/app-sidebar/sidebar-inset-header";
import { WorkspaceSwitcher } from "@/components/features/workspace/workspace-switcher";
import { useStudioHeaderOverrideValue } from "@/components/features/studio/studio-header-context";
import { UploadTaskInbox } from "@/components/features/studio/upload-task-inbox";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface RouteMeta {
  title: string;
}

const ROUTE_META: { prefix: string; meta: RouteMeta }[] = [
  { meta: { title: "人才库" }, prefix: "/studio/resume-pool" },
  { meta: { title: "招聘台" }, prefix: "/studio/resumes" },
  { meta: { title: "AI 面试" }, prefix: "/studio/interviews" },
  { meta: { title: "部门管理" }, prefix: "/studio/departments" },
  { meta: { title: "面试官管理" }, prefix: "/studio/interviewers" },
  { meta: { title: "岗位设置" }, prefix: "/studio/job-descriptions" },
  { meta: { title: "表单题" }, prefix: "/studio/forms" },
  { meta: { title: "沟通题" }, prefix: "/studio/interview-questions" },
  { meta: { title: "我的信息" }, prefix: "/studio/me" },
  { meta: { title: "工作区管理" }, prefix: "/studio/members" },
  { meta: { title: "邮箱监听" }, prefix: "/studio/mail-ingest-accounts" },
  { meta: { title: "上下文设置" }, prefix: "/studio/global-config" },
  { meta: { title: "权限管理" }, prefix: "/studio/permissions" },
];

const DEFAULT_META: RouteMeta = { title: "招聘台" };
const WORKSPACE_PREFIX_REGEX = /^\/w\/[^/]+/;

function resolveRouteMeta(pathname: string): RouteMeta {
  // 实际 URL 形如 /w/[slug]/studio/...,匹配前先把 /w/[slug] 前缀去掉。
  // Strip the /w/[slug] prefix so we can match against bare /studio/<section>.
  const studioPath = pathname.replace(WORKSPACE_PREFIX_REGEX, "");
  for (const { prefix, meta } of ROUTE_META) {
    if (studioPath.startsWith(prefix)) {
      return meta;
    }
  }

  return DEFAULT_META;
}

export function SiteHeader() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { title } = resolveRouteMeta(pathname);
  const headerOverride = useStudioHeaderOverrideValue();

  return (
    <SidebarInsetHeader
      actions={
        <>
          <WorkspaceSwitcher />
          <UploadTaskInbox />
        </>
      }
      breadcrumb={
        headerOverride ?? (
          <Breadcrumb>
            <BreadcrumbList>
              {/* <BreadcrumbItem className="hidden md:block">Studio</BreadcrumbItem> */}
              {/* <BreadcrumbSeparator className="hidden md:block" /> */}
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )
      }
    />
  );
}
