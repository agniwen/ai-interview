"use client";

import { CircleHelpIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useChatTutorial } from "./chat-tutorial";

export function ChatHeader() {
  const { startTutorial } = useChatTutorial();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-sidebar border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mx-2 data-[orientation=vertical]:h-4" orientation="vertical" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>简历筛选助手</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-1">
        <Button onClick={() => startTutorial()} size="sm" variant="ghost">
          <CircleHelpIcon className="size-4" />
          使用教程
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
