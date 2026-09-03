"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import {
  SidebarBodyPortalContent,
  SidebarFooterPortalContent,
} from "@/components/layout/app-sidebar/portals";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { useSidebarMenuHoverHighlight } from "@/components/layout/app-sidebar/sidebar-menu-hover-highlight";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  platformSidebarNavSections,
  resolvePlatformSidebarNavItem,
} from "./platform-sidebar-navigation";

export { platformSidebarNavSections, resolvePlatformSidebarNavItem };

export function PlatformSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { state } = useSidebar();
  const activeNavItem = resolvePlatformSidebarNavItem(pathname);
  const { containerRef, hideMenuHighlight, hoverHighlight, moveToMenuItem } =
    useSidebarMenuHoverHighlight();

  return (
    <>
      <SidebarBodyPortalContent>
        <div className="relative" onPointerLeave={hideMenuHighlight} ref={containerRef}>
          {hoverHighlight}
          {platformSidebarNavSections.map((section) => (
            <SidebarGroup key={section.id}>
              {section.title ? <SidebarGroupLabel>{section.title}</SidebarGroupLabel> : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem
                        className="relative"
                        key={item.path}
                        onPointerEnter={(event) => moveToMenuItem(event.currentTarget)}
                      >
                        <SidebarMenuButton
                          className="relative z-10 cursor-default select-none transition-[width,height,padding,background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-transparent! active:scale-[0.98] data-[active=false]:opacity-90 data-[active=false]:hover:opacity-100 motion-reduce:transition-none motion-reduce:active:scale-100"
                          isActive={item === activeNavItem}
                          render={
                            <Link to={item.path}>
                              <Icon />
                              <span>{item.title}</span>
                            </Link>
                          }
                          size="default"
                          tooltip={item.title}
                        />
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>
      </SidebarBodyPortalContent>

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL="/platform/organizations"
          collapsed={state === "collapsed"}
          showHomeLink={true}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
