import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/app/(auth)/studio/_components/site-header";
import { StudioSidebarSlots } from "@/app/(auth)/studio/_components/studio-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/auth-roles";

export const metadata: Metadata = {
  description: "Studio 管理后台。",
  title: {
    default: "Studio",
    template: "%s | Studio",
  },
};

export default async function StudioLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  if (!canAccessAdmin(session.user)) {
    redirect("/studio-unauthorized");
  }

  return (
    <>
      <StudioSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)]">
        <SiteHeader />
        <div className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}
