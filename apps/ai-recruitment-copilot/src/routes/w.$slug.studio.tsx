import type { ReactNode } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SiteHeader } from "@/components/studio/site-header";
import { StudioSidebarSlots } from "@/components/studio/studio-sidebar-slots";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";

function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StudioSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1.5rem)] border border-border">
        <SiteHeader />
        <ScrollArea className="@container/main min-h-0 flex-1 bg-background">
          <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
            {children}
          </PendingOutlet>
        </ScrollArea>
      </SidebarInset>
    </>
  );
}

function StudioShellRoute() {
  return (
    <StudioLayout>
      <Outlet />
    </StudioLayout>
  );
}

export const Route = createFileRoute("/w/$slug/studio")({
  component: StudioShellRoute,
  head: () => ({
    meta: [
      {
        content: "Studio 管理后台。",
        name: "description",
      },
      { title: "Studio" },
    ],
  }),
  loader: (loaderContext) => {
    const { location, params } = loaderContext as {
      location: { pathname: string };
      params: { slug: string };
    };

    if (location.pathname === `/w/${params.slug}/studio`) {
      throw redirect({ href: `/w/${params.slug}/studio/dashboard` });
    }

    return null;
  },
});
