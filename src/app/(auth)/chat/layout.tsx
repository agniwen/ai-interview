import type { ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { ChatSidebarSlots } from "./_components/chat-sidebar-slots";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ChatSidebarSlots />
      <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)]">
        {children}
      </SidebarInset>
    </>
  );
}
