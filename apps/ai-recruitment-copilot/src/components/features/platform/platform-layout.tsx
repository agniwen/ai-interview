"use client";

import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppVersionProvider } from "@/components/features/app-version/app-version-provider";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { PlatformSidebarShell } from "@/components/layout/platform-sidebar/platform-sidebar-shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { PlatformHeader } from "./platform-header";
import { PlatformSidebarSlots } from "./platform-sidebar-slots";
import { resolvePlatformSidebarTab } from "./platform-sidebar-tabs";

function PlatformContent({ children }: { children: ReactNode }) {
  const isMastraStudio = useRouterState({
    select: (state) => resolvePlatformSidebarTab(state.location.pathname) === "mastra",
  });

  if (isMastraStudio) {
    return (
      <div className="@container/main flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PlatformHeader />
        <PendingOutlet className="min-h-0 flex-1 overflow-hidden">{children}</PendingOutlet>
      </div>
    );
  }

  return (
    <ScrollArea className="@container/main min-h-0 flex-1 bg-background">
      <PlatformHeader />
      <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
        {children}
      </PendingOutlet>
    </ScrollArea>
  );
}

export function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <AppVersionProvider>
      <PlatformSidebarShell>
        <PlatformSidebarSlots />
        <SidebarInset className="h-dvh overflow-hidden border border-border md:h-[calc(100dvh-1.5rem)]">
          <PlatformContent>{children}</PlatformContent>
        </SidebarInset>
        <BackgroundStreamToaster />
      </PlatformSidebarShell>
    </AppVersionProvider>
  );
}
