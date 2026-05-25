import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/app/(auth)/w/[slug]/studio/_components/site-header";
import { StudioSidebarSlots } from "@/app/(auth)/w/[slug]/studio/_components/studio-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  description: "Studio 管理后台。",
  title: {
    default: "Studio",
    template: "%s | Studio",
  },
};

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StudioSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)] border border-border/60">
        <SiteHeader />
        <div className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar">
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}
