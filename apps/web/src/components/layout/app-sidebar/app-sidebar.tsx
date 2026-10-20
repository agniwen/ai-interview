"use client";

import type { ComponentProps } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "./portals";
import {
  SidebarBodySkeleton,
  SidebarFooterSkeleton,
  SidebarSlotHydrationFallback,
} from "./sidebar-slot-skeleton";
import { SidebarTabs } from "./sidebar-tabs";
import { RecruitmentCopilotBrand } from "./recruitment-copilot-brand";

type AppSidebarProps = ComponentProps<typeof Sidebar>;

export function AppSidebar({ ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="relative gap-2 overflow-x-clip">
        <div className="relative h-8 shrink-0">
          <RecruitmentCopilotBrand className="h-8 w-[calc(var(--sidebar-width)-5rem)] transition-opacity duration-150 group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none" />
          <SidebarTrigger className="absolute top-0 right-0 size-8" />
        </div>
        <SidebarTabs />
        <SidebarHeaderPortalTarget className="contents" />
      </SidebarHeader>
      <SidebarContent className="relative overflow-hidden">
        <ScrollArea
          className="min-h-0 flex-1"
          scrollFade
          scrollbars="leave"
          options={{
            overflow: { x: "hidden", y: "scroll" },
            scrollbars: { autoHide: "leave", autoHideDelay: 600, theme: "os-theme-app" },
          }}
        >
          <SidebarBodyPortalTarget className="contents" />
          <SidebarSlotHydrationFallback>
            <SidebarBodySkeleton />
          </SidebarSlotHydrationFallback>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-0">
        <SidebarFooterPortalTarget className="contents" />
        <SidebarSlotHydrationFallback>
          <SidebarFooterSkeleton />
        </SidebarSlotHydrationFallback>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
