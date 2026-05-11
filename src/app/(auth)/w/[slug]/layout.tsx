import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { getCurrentSession } from "@/lib/server/auth-session";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getCurrentSession();

  if (!session?.user) {
    redirect("/login");
  }

  const [row] = await db
    .select({
      organizationId: organization.id,
      organizationSlug: organization.slug,
    })
    .from(organization)
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)),
    )
    .where(eq(organization.slug, slug))
    .limit(1);

  if (!row) {
    notFound();
  }

  // 持久化 activeOrganizationId，这样 client RPC 与 server actions 都对齐到当前 URL。
  // Better Auth 的 setActiveOrganization 会更新 session 行 + cookie。
  const activeOrgId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (activeOrgId !== row.organizationId) {
    await auth.api.setActiveOrganization({
      body: { organizationId: row.organizationId },
      headers: await headers(),
    });
  }

  return <WorkspaceSlugProvider slug={slug}>{children}</WorkspaceSlugProvider>;
}
