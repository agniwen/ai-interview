import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth-session";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }
  return <div className="min-h-screen bg-background">{children}</div>;
}
