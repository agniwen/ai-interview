import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { auth } from "@/lib/server/auth";
import { getCurrentOrganizations, getCurrentSession } from "@/lib/server/auth-session";
import { user as userTable } from "@/lib/shared/db/schema";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { AppSidebarShell } from "@/components/app-sidebar/app-sidebar-shell";

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
    // 同步写 user.lastActiveOrganizationId —— 这是跨 session 的"上次访问"记忆，
    // 退出登录重新登进来时 databaseHooks.session.create.after 会把它还原成
    // 新 session 的 activeOrganizationId（见 src/lib/server/auth.ts）。
    // Mirror to user.lastActiveOrganizationId so the next login restores this
    // workspace (vs. falling back to the user's first org). The session-create
    // hook in auth.ts reads this on the next login.
    await db
      .update(userTable)
      .set({ lastActiveOrganizationId: matched.id })
      .where(eq(userTable.id, session.user.id));
  }

  return (
    <WorkspaceSlugProvider slug={slug}>
      <AppSidebarShell>{children}</AppSidebarShell>
    </WorkspaceSlugProvider>
  );
}
