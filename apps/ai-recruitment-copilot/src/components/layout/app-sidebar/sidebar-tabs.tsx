"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { resolveSidebarTab } from "./sidebar-slot-transition";
import type { SidebarTabValue } from "./sidebar-slot-transition";

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const activeTab = resolveSidebarTab(pathname);
  const slug = useWorkspaceSlug();

  const handleChange = (value: string) => {
    const nextTab = value as SidebarTabValue;
    const target = nextTab === "agent" ? `/w/${slug}/agent` : `/w/${slug}/studio/resumes`;

    if (target !== pathname) {
      void navigate({ to: target });
    }
  };

  return (
    <Tabs
      // Manual activation: Radix's default "automatic" mode calls
      // onValueChange on focus — when sonner restores focus to the
      // previously-active tab trigger after dismissing a toast, that
      // would route us back to the wrong tab.
      activationMode="manual"
      className="w-full group-data-[collapsible=icon]:hidden"
      onValueChange={handleChange}
      value={activeTab ?? "agent"}
    >
      <TabsList className="w-full dark:bg-sidebar/60  select-none">
        <TabsTrigger value="agent">Agent</TabsTrigger>
        <TabsTrigger value="studio">Studio</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
