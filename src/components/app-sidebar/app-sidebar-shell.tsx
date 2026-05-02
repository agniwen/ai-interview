"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "./portals";

const sidebarStyle = {
  "--header-height": "calc(var(--spacing) * 12)",
  "--sidebar-width": "calc(var(--spacing) * 72)",
} as CSSProperties;

export function AppSidebarShell({
  canAccessAdmin,
  children,
}: {
  canAccessAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarHeaderPortalProvider>
      <SidebarBodyPortalProvider>
        <SidebarFooterPortalProvider>
          <SidebarProvider style={sidebarStyle}>
            <AppSidebar canAccessAdmin={canAccessAdmin} />
            {children}
          </SidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
