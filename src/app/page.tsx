import { redirect } from "next/navigation";
import { getCurrentSession, resolveActiveOrganization } from "@/lib/server/auth-session";
import HomeShell from "./_components/home-shell";

export default async function HomePage() {
  const session = await getCurrentSession();
  if (session?.user) {
    const target = await resolveActiveOrganization();
    if (target) {
      redirect(`/w/${target.slug}`);
    } else {
      redirect("/select-workspace");
    }
  }

  return <HomeShell />;
}
