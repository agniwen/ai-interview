import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import HomeShell from "./_components/home-shell";

export default async function HomePage() {
  // Resolve session without the cached helper — this page lives outside (auth)
  // and needs its own headers() call.
  const { headers } = await import("next/headers");
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user) {
    let targetSlug: string | null = null;

    const activeId = (session.session as { activeOrganizationId?: string | null } | null)
      ?.activeOrganizationId;

    if (activeId) {
      const [org] = await db
        .select({ slug: organization.slug })
        .from(organization)
        .where(eq(organization.id, activeId))
        .limit(1);
      targetSlug = org?.slug ?? null;
    }

    if (!targetSlug) {
      const [first] = await db
        .select({ slug: organization.slug })
        .from(organization)
        .innerJoin(member, eq(member.organizationId, organization.id))
        .where(eq(member.userId, session.user.id))
        .orderBy(asc(member.createdAt))
        .limit(1);
      targetSlug = first?.slug ?? null;
    }

    if (targetSlug) {
      redirect(`/w/${targetSlug}`);
    } else {
      redirect("/select-workspace");
    }
  }

  return <HomeShell />;
}
