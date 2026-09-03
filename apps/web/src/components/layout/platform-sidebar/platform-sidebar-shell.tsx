"use client";

import type { CSSProperties, ReactNode } from "react";
import { PersistedSidebarProvider } from "@/components/layout/persisted-sidebar-provider";
import { PlatformSidebar } from "./platform-sidebar";
import {
  SidebarBodyPortalProvider,
  SidebarFooterPortalProvider,
  SidebarHeaderPortalProvider,
} from "@/components/layout/app-sidebar/portals";

interface SidebarStyle extends CSSProperties {
  "--header-height": string;
  "--sidebar-width": string;
}

const sidebarStyle: SidebarStyle = {
  "--header-height": "calc(var(--spacing) * 12)",
  "--sidebar-width": "calc(var(--spacing) * 72)",
};

export function PlatformSidebarShell({ children }: { children: ReactNode }) {
  return (
    <SidebarHeaderPortalProvider>
      <SidebarBodyPortalProvider>
        <SidebarFooterPortalProvider>
          <PersistedSidebarProvider style={sidebarStyle}>
            <PlatformSidebar />
            {children}
          </PersistedSidebarProvider>
        </SidebarFooterPortalProvider>
      </SidebarBodyPortalProvider>
    </SidebarHeaderPortalProvider>
  );
}
