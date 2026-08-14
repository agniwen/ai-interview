import { Link } from "@tanstack/react-router";
import type { AppIconName } from "@/components/ui/icon";
import { Icon } from "@/components/ui/icon";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export interface SidebarNavItemConfig {
  icon: AppIconName;
  title: string;
  to: string;
}

export function SidebarNavItem({ item, active }: { item: SidebarNavItemConfig; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="data-[active=false]:opacity-90 data-[active=false]:hover:opacity-100"
        isActive={active}
        render={
          <Link to={item.to}>
            <Icon icon={item.icon} />
            <span>{item.title}</span>
          </Link>
        }
        tooltip={item.title}
      />
    </SidebarMenuItem>
  );
}
