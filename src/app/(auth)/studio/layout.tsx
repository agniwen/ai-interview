import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SiteHeader } from "@/app/(auth)/studio/_components/site-header";
import { StudioSidebarSlots } from "@/app/(auth)/studio/_components/studio-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";
import { auth } from "@/lib/server/auth";
import { canAccessAdmin } from "@/lib/server/auth-roles";

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
    // /login 自己会识别"已登录但非 admin"状态并渲染 UnauthorizedNotice；
    // 这里不能直接渲染 UI（layout 是 server component，且需要先签出）。
    // /login renders UnauthorizedNotice itself when it sees a logged-in
    // non-admin session — keep the redirect so sign-out flow is centralized.
    redirect("/login");
  }

  return (
    <>
      <StudioSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)] border border-border/60">
        <SiteHeader />
        <div className="@container/main flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar dark:bg-background">
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">{children}</div>
        </div>
      </SidebarInset>
    </>
  );
}
