import type { ReactNode } from "react";
import { AppSidebarShell } from "@/components/layout/app-sidebar/app-sidebar-shell";

/**
 * Root desktop chrome (Cursor-style, no global title bar):
 *   Sidebar (top drag region under traffic lights)
 *   Content pane (own title bar: history / settings / window controls)
 */
export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <AppSidebarShell>{children}</AppSidebarShell>
    </div>
  );
}
