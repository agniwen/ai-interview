"use client";

import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { resolveSidebarTab } from "./sidebar-slot-transition";
import type { SidebarTabValue } from "./sidebar-slot-transition";

function getSidebarTabTarget(tab: SidebarTabValue, slug: string) {
  return tab === "agent"
    ? ({ params: { slug }, to: "/w/$slug/agent" } as const)
    : ({ params: { slug }, to: "/w/$slug/studio/resumes" } as const);
}

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const activeTab = resolveSidebarTab(pathname);
  const slug = useWorkspaceSlug();

  const handleChange = (value: string) => {
    const nextTab = value as SidebarTabValue;
    const target = getSidebarTabTarget(nextTab, slug);

    if (nextTab !== activeTab) {
      void navigate(target);
    }
  };

  const preloadTab = async (tab: SidebarTabValue) => {
    if (tab === activeTab) {
      return;
    }
    try {
      await router.preloadRoute(getSidebarTabTarget(tab, slug));
    } catch {
      // A failed speculative preload must not prevent the later navigation.
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
        <TabsTrigger
          onFocus={() => void preloadTab("agent")}
          onPointerEnter={() => void preloadTab("agent")}
          onTouchStart={() => void preloadTab("agent")}
          value="agent"
        >
          Agent
        </TabsTrigger>
        <TabsTrigger
          onFocus={() => void preloadTab("studio")}
          onPointerEnter={() => void preloadTab("studio")}
          onTouchStart={() => void preloadTab("studio")}
          value="studio"
        >
          Studio
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
