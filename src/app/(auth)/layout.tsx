import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppSidebarShell } from "@/components/app-sidebar/app-sidebar-shell";
import { auth } from "@/lib/auth";
import { canAccessAdmin } from "@/lib/auth-roles";
import { BackgroundStreamToaster } from "./chat/_components/background-stream-toaster";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  await connection();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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
