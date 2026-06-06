import "server-only";

import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth-session";

export async function requirePlatformAdmin() {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }
  return session;
}
