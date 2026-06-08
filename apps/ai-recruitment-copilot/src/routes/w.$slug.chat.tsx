import type { ReactNode } from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatSidebarSlots } from "@/components/chat/chat-sidebar-slots";
import { SidebarInset } from "@/components/ui/sidebar";
import { cn } from "@arc/shared/utils/cn";

function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChatSidebarSlots />
      <SidebarInset
        className={cn(
          "isolate h-dvh border border-border overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-center before:bg-cover before:bg-no-repeat before:content-[''] md:h-[calc(100dvh-1.5rem)]",
        )}
      >
        <ChatHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
}

function ChatShellRoute() {
  return (
    <ChatLayout>
      <Outlet />
    </ChatLayout>
  );
}

export const Route = createFileRoute("/w/$slug/chat")({
  component: ChatShellRoute,
});
