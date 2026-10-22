import type { ReactNode } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import { ChatHeader, ChatHeaderTitleProvider } from "@/components/features/chat/chat-header";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SidebarInset } from "@/components/ui/sidebar";
import { cn } from "@app/shared/utils/cn";
import { documentTitleMeta } from "@/lib/start/document-title";

function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <ChatHeaderTitleProvider>
      <SidebarInset
        className={cn(
          "isolate h-dvh overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-center before:bg-cover before:bg-no-repeat before:content-[''] md:h-[calc(100dvh-1rem)] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        )}
      >
        <ChatHeader />
        <PendingOutlet className="flex min-h-0 flex-1 flex-col">{children}</PendingOutlet>
      </SidebarInset>
    </ChatHeaderTitleProvider>
  );
}

function AgentShellRoute() {
  return (
    <AgentLayout>
      <Outlet />
    </AgentLayout>
  );
}

export const Route = createFileRoute("/w/$slug/agent")({
  // 没有招聘助手权限的角色（如面试官）回到工作台，由工作台落到第一个有权限的页面。
  // Roles without chat access (e.g. interviewers) fall back to the studio's first allowed page.
  loader: async ({ params, parentMatchPromise }) => {
    const parentMatch = await parentMatchPromise;
    const state = parentMatch.loaderData;
    if (
      state?.status === "ready" &&
      !hasPermissionInStatements(state.permissions, "chat", "read")
    ) {
      throw redirect({ href: `/w/${params.slug}/studio` });
    }
    return null;
  },
  component: AgentShellRoute,
  head: ({ matches }) => ({
    meta: documentTitleMeta(matches),
  }),
});
