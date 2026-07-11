"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useGlimm } from "glimm/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

type SidebarTabValue = "agent" | "studio";

function resolveActiveTab(pathname: string): SidebarTabValue | null {
  if (!pathname.startsWith("/w/")) {
    return null;
  }
  if (pathname.includes("/studio")) {
    return "studio";
  }
  if (pathname.includes("/agent") || pathname.includes("/chat")) {
    return "agent";
  }
  return null;
}

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { sweep } = useGlimm();
  const activeTab = resolveActiveTab(pathname);
  const slug = useWorkspaceSlug();

  const handleChange = (value: string) => {
    const nextTab = value as SidebarTabValue;
    const target = nextTab === "agent" ? `/w/${slug}/agent` : `/w/${slug}/studio/resumes`;

    if (target !== pathname) {
      void sweep(
        () => {
          navigate({ to: target });
        },
        {
          direction: nextTab === "agent" ? "rtl" : "ltr",
        },
      ).done;
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
