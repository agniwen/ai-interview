import type { ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatHeader } from "./_components/chat-header";
import { ChatSidebarSlots } from "./_components/chat-sidebar-slots";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChatSidebarSlots />
      <SidebarInset className="isolate h-dvh overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[url('/textures/interview-prep-light.png')] before:bg-center before:bg-cover before:bg-no-repeat before:opacity-20 before:content-[''] md:h-[calc(100dvh-1rem)] dark:before:bg-[url('/textures/interview-prep-dark.png')]">
        <ChatHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
}
