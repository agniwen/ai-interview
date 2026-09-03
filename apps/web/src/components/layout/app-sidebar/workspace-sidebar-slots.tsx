"use client";

import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChatSidebarSlots } from "@/components/features/chat/chat-sidebar-slots";
import { StudioSidebarSlots } from "@/components/features/studio/studio-sidebar-slots";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { useSidebar } from "@/components/ui/sidebar";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { SidebarFooterPortalContent } from "./portals";
import { resolveSidebarSlotDirection, resolveSidebarTab } from "./sidebar-slot-transition";
import type { SidebarTabValue } from "./sidebar-slot-transition";

export function WorkspaceSidebarSlots() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = resolveSidebarTab(pathname) ?? "agent";
  const previousTabRef = useRef<SidebarTabValue>(activeTab);
  // oxlint-disable-next-line react/refs -- The ref is read by a post-render callback or transition calculation.
  const direction = resolveSidebarSlotDirection(previousTabRef.current, activeTab);
  const slug = useWorkspaceSlug();
  const { state } = useSidebar();

  useEffect(() => {
    previousTabRef.current = activeTab;
  }, [activeTab]);

  const callbackURL = activeTab === "agent" ? `/w/${slug}/agent` : `/w/${slug}/studio`;

  return (
    <>
      <ChatSidebarSlots active={activeTab === "agent"} direction={direction} />
      <StudioSidebarSlots active={activeTab === "studio"} direction={direction} />

      <SidebarFooterPortalContent>
        <SidebarUserSection
          callbackURL={callbackURL}
          collapsed={state === "collapsed"}
          showHomeLink={false}
        />
      </SidebarFooterPortalContent>
    </>
  );
}
