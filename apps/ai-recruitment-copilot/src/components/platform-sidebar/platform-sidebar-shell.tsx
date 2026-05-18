"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { PlatformSidebar } from "./platform-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "@/components/app-sidebar/portals";

const sidebarStyle = {
  "--header-height": "calc(var(--spacing) * 12)",
  "--sidebar-width": "calc(var(--spacing) * 72)",
} as CSSProperties;

export function PlatformSidebarShell({ children }: { children: ReactNode }) {
  return (
    <SidebarHeaderPortalProvider>
      <SidebarBodyPortalProvider>
        <SidebarFooterPortalProvider>
          <SidebarProvider style={sidebarStyle}>
            <PlatformSidebar />
            {children}
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
