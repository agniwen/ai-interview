"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "./portals";
import { WorkspaceSidebarSlots } from "./workspace-sidebar-slots";

interface SidebarStyle extends CSSProperties {
  "--header-height": string;
  "--sidebar-width": string;
}

const sidebarStyle: SidebarStyle = {
  "--header-height": "calc(var(--spacing) * 12)",
  "--sidebar-width": "calc(var(--spacing) * 72)",
};

export function AppSidebarShell({ children }: { children: ReactNode }) {
  return (
    <SidebarHeaderPortalProvider>
      <SidebarBodyPortalProvider>
        <SidebarFooterPortalProvider>
          <SidebarProvider style={sidebarStyle}>
            <AppSidebar />
            <WorkspaceSidebarSlots />
            {children}
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
