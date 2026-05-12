import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getCurrentOrganizations, getCurrentSession } from "@/lib/server/auth-session";
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

  const orgs = await getCurrentOrganizations();
  const matched = orgs.find((o) => o.slug === slug);

  if (!matched) {
    notFound();
  }

  // 持久化 activeOrganizationId，这样 client RPC 与 server actions 都对齐到当前 URL。
  // Better Auth 的 setActiveOrganization 会更新 session 行 + cookie。
  // Persist activeOrganizationId so client RPC and server actions stay aligned
  // with the current URL. setActiveOrganization updates the session row + cookie.
  const activeOrgId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (activeOrgId !== matched.id) {
    await auth.api.setActiveOrganization({
      body: { organizationId: matched.id },
      headers: await headers(),
    });
  }

  return <WorkspaceSlugProvider slug={slug}>{children}</WorkspaceSlugProvider>;
}
