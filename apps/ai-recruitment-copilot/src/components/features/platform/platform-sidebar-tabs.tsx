"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PlatformSidebarTab = "manage" | "mastra";

const MANAGE_PATH = "/platform/organizations";
const MASTRA_PATH = "/platform/mastra-studio/agents";

export function resolvePlatformSidebarTab(pathname: string): PlatformSidebarTab {
  return pathname === "/platform/mastra-studio" || pathname.startsWith("/platform/mastra-studio/")
    ? "mastra"
    : "manage";
}

export function PlatformSidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const activeTab = resolvePlatformSidebarTab(pathname);

  const handleChange = (value: string) => {
    const target = value === "mastra" ? MASTRA_PATH : MANAGE_PATH;

    if (target !== pathname) {
      void navigate({ to: target });
    }
  };

  return (
    <Tabs
      activationMode="manual"
      className="w-full group-data-[collapsible=icon]:hidden"
      onValueChange={handleChange}
      value={activeTab}
    >
      <TabsList className="w-full select-none dark:bg-sidebar/60">
        <TabsTrigger value="manage">Manage</TabsTrigger>
        <TabsTrigger value="mastra">Mastra</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
