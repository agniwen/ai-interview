import type { ReactNode } from "react";
import { PlatformSidebarShell } from "@/components/platform-sidebar/platform-sidebar-shell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { requirePlatformAdmin } from "@/lib/server/platform-admin";
import { PlatformHeader } from "./_components/platform-header";
import { PlatformSidebarSlots } from "./_components/platform-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();

  return (
    <PlatformSidebarShell>
      <PlatformSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1.5rem)] border border-border">
        <PlatformHeader />
        <ScrollArea className="@container/main min-h-0 flex-1 bg-background">
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
        </ScrollArea>
      </SidebarInset>
    </PlatformSidebarShell>
  );
}
