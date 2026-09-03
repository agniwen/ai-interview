import type { ReactNode } from "react";
import { SettingsSidebarSlots } from "@/components/features/settings/settings-sidebar-slots";

export function SettingsLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <>
      <SettingsSidebarSlots />
      {children}
    </>
  );
}
