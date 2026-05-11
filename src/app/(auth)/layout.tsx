import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppSidebarShell } from "@/components/app-sidebar/app-sidebar-shell";
import { canAccessAdmin } from "@/lib/server/auth-roles";
import { getCurrentSession } from "@/lib/server/auth-session";
import { BackgroundStreamToaster } from "./chat/_components/background-stream-toaster";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <AppSidebarShell canAccessAdmin={canAccessAdmin(session.user)}>
      {children}
      <BackgroundStreamToaster />
    </AppSidebarShell>
  );
}
