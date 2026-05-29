import type { ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatHeader } from "./_components/chat-header";
import { ChatSidebarSlots } from "./_components/chat-sidebar-slots";
import { cn } from "@/lib/shared/utils/cn";

// Workspace 校验与 slug context 已由父级 /w/[slug]/layout.tsx 完成,这里只负责 chat shell。
// Parent /w/[slug]/layout.tsx already gates the workspace and supplies the slug
// context — this layout only renders the chat shell.
export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChatSidebarSlots />
      <SidebarInset
        className={cn(
          "before:opacity-10 dark:before:opacity-50 before:bg-[url('/textures/interview-prep-light.png')] dark:before:bg-[url('/textures/interview-prep-dark.png')]",
          "isolate h-dvh border border-border overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10  before:bg-center before:bg-cover before:bg-no-repeat before:content-[''] md:h-[calc(100dvh-1.5rem)] ",
        )}
      >
        <ChatHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
}
