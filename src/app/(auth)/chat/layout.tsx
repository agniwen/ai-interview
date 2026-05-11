import { asc, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { getCurrentSession } from "@/lib/server/auth-session";
import { db } from "@/lib/server/db";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { member, organization } from "@/lib/shared/db/schema";
import { ChatHeader } from "./_components/chat-header";
import { ChatSidebarSlots } from "./_components/chat-sidebar-slots";

// Chat 路由不挂在 /w/[slug] 下，但 chat 消息里可能嵌入 studio 组件
// (ResumeImportButton / InterviewDetailDialog 等)，它们调用 useWorkspaceSlug。
// 这里在服务端解出当前用户的活跃 workspace slug，再通过 WorkspaceSlugProvider
// 注入到客户端组件树，让那些 studio 组件能正常构造 /w/[slug]/studio/... 链接。
async function resolveActiveWorkspaceSlug(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return null;
  }

  const activeId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (activeId) {
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, activeId))
      .limit(1);
    if (org?.slug) {
      return org.slug;
    }
  }

  const [first] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return first?.slug ?? null;
}

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const slug = await resolveActiveWorkspaceSlug();
  if (!slug) {
    // 已登录用户至少在 P1 backfill 后必有一个 member 关系；走到这里说明
    // session 失效或用户被踢出所有工作区，引导到选择/创建页。
    redirect("/select-workspace");
  }

  return (
    <WorkspaceSlugProvider slug={slug}>
      <ChatSidebarSlots />
      <SidebarInset className="isolate h-dvh border border-border/60 overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[url('/textures/interview-prep-light.png')] before:bg-center before:bg-cover before:bg-no-repeat before:opacity-20 before:content-[''] md:h-[calc(100dvh-1rem)] dark:before:bg-[url('/textures/interview-prep-dark.png')]">
        <ChatHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </WorkspaceSlugProvider>
  );
}
