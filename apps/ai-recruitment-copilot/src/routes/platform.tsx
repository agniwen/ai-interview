import type { ReactNode } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { PlatformSidebarShell } from "@/components/layout/platform-sidebar/platform-sidebar-shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { PlatformHeader } from "@/components/features/platform/platform-header";
import { PlatformSidebarSlots } from "@/components/features/platform/platform-sidebar-slots";
import { AppVersionProvider } from "@/components/features/app-version/app-version-provider";
import { getPlatformAdminState } from "@/lib/start/platform-admin";

function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <AppVersionProvider>
      <PlatformSidebarShell>
        <PlatformSidebarSlots />
        <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1.5rem)] border border-border">
          <ScrollArea className="@container/main min-h-0 flex-1 bg-background">
            <PlatformHeader />
            <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
              {children}
            </PendingOutlet>
          </ScrollArea>
        </SidebarInset>
        <BackgroundStreamToaster />
      </PlatformSidebarShell>
    </AppVersionProvider>
  );
}

function PlatformRoute() {
  return (
    <PlatformLayout>
      <Outlet />
    </PlatformLayout>
  );
}

export const Route = createFileRoute("/platform")({
  component: PlatformRoute,
  head: () => ({
    meta: [{ title: "平台管理" }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as { location: { pathname: string } };
    const state = await getPlatformAdminState();
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    if (location.pathname === "/platform") {
      throw redirect({ href: "/platform/organizations" });
    }
    return null;
  },
});
