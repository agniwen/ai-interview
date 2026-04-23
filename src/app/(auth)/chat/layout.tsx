import type { ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatHeader } from "./_components/chat-header";
import { ChatSidebarSlots } from "./_components/chat-sidebar-slots";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChatSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)]">
        <ChatHeader />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
}
