"use client";

import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppVersionProvider } from "@/components/features/app-version/app-version-provider";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { PlatformSidebarShell } from "@/components/layout/platform-sidebar/platform-sidebar-shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { PageHeader } from "@/components/features/studio/page-header";
import { PlatformHeader } from "./platform-header";
import { resolvePlatformPageMeta } from "./platform-sidebar-navigation";
import { PlatformSidebarSlots } from "./platform-sidebar-slots";

// 与 Studio 页面一致的大标题；与页面内容共用 container 宽度以保持左对齐。
// Studio-style page heading, sharing the routes' container width so it stays aligned.
function PlatformPageHeading() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { pageTitle } = resolvePlatformPageMeta(pathname);
  if (!pageTitle) {
    return null;
  }
  return (
    <div className="container mx-auto">
      <PageHeader title={pageTitle} />
    </div>
  );
}

function PlatformContent({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="@container/main min-h-0 flex-1 bg-background">
      <PlatformHeader />
      <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
        <PlatformPageHeading />
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
        <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1.5rem)]">
          <PlatformContent>{children}</PlatformContent>
        </SidebarInset>
        <BackgroundStreamToaster />
      </PlatformSidebarShell>
    </AppVersionProvider>
  );
}
