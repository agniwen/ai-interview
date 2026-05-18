import { and, eq, isNull, ne, or } from "drizzle-orm";
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
  }

  // 写 user.lastActiveOrganizationId —— 跨 session 的"上次访问"记忆，退出登录
  // 重新登进来时 databaseHooks.session.create.after 拿这个值还原 session.
  // activeOrganizationId（见 src/lib/server/auth.ts）。
  //
  // ⚠️ 必须放在上面 if 块之外。sidebar 的 WorkspaceSwitcher 在点击切换时是先
  // 在客户端调 setActive(B) 把 session.activeOrganizationId 写成 B，再硬跳到
  // /w/B（见 workspace-switcher.tsx 的注释）。所以 layout 跑到这里时
  // session.activeOrganizationId 已经是 B，`activeOrgId !== matched.id` 判定
  // 为 false——上一版 UPDATE 放在 if 内会让"用 switcher 切的人"永远写不到
  // user 表。
  //
  // WHERE 守卫 (IS NULL OR != matched.id) 让"同一个 workspace 内的页面切换"不
  // 触发实际写入：PG 在 WHERE 0 行匹配时不会执行 SET，`$onUpdate` 也不会触发
  // updatedAt。
  //
  // Must live OUTSIDE the `if` above: the sidebar switcher pre-syncs the
  // session via authClient.organization.setActive before navigating, so by
  // the time this layout runs, the `if` condition is already false. The
  // previous iteration of this fix put the user-table update inside the if,
  // which meant the switcher path never wrote it. The WHERE guard short-
  // circuits unnecessary writes when navigating within the same workspace.
  await db
    .update(userTable)
    .set({ lastActiveOrganizationId: matched.id })
    .where(
      and(
        eq(userTable.id, session.user.id),
        or(
          isNull(userTable.lastActiveOrganizationId),
          ne(userTable.lastActiveOrganizationId, matched.id),
        ),
      ),
    );

  return (
    <WorkspaceSlugProvider slug={slug}>
      <AppSidebarShell>{children}</AppSidebarShell>
    </WorkspaceSlugProvider>
  );
}
