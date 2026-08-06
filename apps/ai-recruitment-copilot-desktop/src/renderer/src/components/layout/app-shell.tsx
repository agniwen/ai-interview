import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TitleBar } from "@/components/title-bar";

/**
 * Root desktop chrome: custom title bar + OverlayScrollbars content viewport.
 * Prefer this over native overflow-auto so system scrollbars stay hidden.
 */
export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <TitleBar />
      <ScrollArea className="min-h-0 flex-1" scrollbars="leave">
        {children}
      </ScrollArea>
    </div>
  );
}
