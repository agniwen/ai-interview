"use client";

import { SidebarInsetHeader } from "@/components/app-sidebar/sidebar-inset-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

export function ChatHeader() {
  return (
    <SidebarInsetHeader
      className="bg-background/60 backdrop-blur-md"
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>简历筛选助手</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  );
}
