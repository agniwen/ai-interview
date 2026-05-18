import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth-session";
import { PlatformSidebarShell } from "@/components/platform-sidebar/platform-sidebar-shell";
import { PlatformHeader } from "./_components/platform-header";
import { PlatformSidebarSlots } from "./_components/platform-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <PlatformSidebarShell>
      <PlatformSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)] border border-border/60">
        <PlatformHeader />
        <div className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar dark:bg-background">
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
        </div>
      </SidebarInset>
    </PlatformSidebarShell>
  );
}
