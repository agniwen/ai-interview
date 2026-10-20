"use client";

import type { ComponentProps } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
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

type AppSidebarProps = ComponentProps<typeof Sidebar>;

export function AppSidebar({ ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="relative gap-3 overflow-x-clip">
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
