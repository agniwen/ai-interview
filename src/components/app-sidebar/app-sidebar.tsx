"use client";

import type { ComponentProps } from "react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import {
  SidebarBodyPortalTarget,
  SidebarFooterPortalTarget,
  SidebarHeaderPortalTarget,
} from "./portals";
import { SidebarTabs } from "./sidebar-tabs";

type AppSidebarProps = ComponentProps<typeof Sidebar> & {
  canAccessAdmin: boolean;
};

export function AppSidebar({ canAccessAdmin, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" data-tour="sidebar" variant="inset" {...props}>
      <SidebarHeader className="gap-3">
        <SidebarTabs canAccessAdmin={canAccessAdmin} />
        <SidebarHeaderPortalTarget className="contents" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarBodyPortalTarget className="contents" />
      </SidebarContent>
      <SidebarFooter className="p-0">
        <SidebarFooterPortalTarget className="contents" />
      </SidebarFooter>
    </Sidebar>
  );
}
