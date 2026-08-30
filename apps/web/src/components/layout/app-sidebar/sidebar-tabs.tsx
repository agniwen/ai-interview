"use client";

import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { RecruitmentCopilotBrand } from "./recruitment-copilot-brand";
import { resolveSidebarTab } from "./sidebar-slot-transition";
import type { SidebarTabValue } from "./sidebar-slot-transition";

function getSidebarTabTarget(tab: SidebarTabValue, slug: string) {
  return tab === "agent"
    ? ({ params: { slug }, to: "/w/$slug/agent" } as const)
    : ({ params: { slug }, to: "/w/$slug/studio/resumes" } as const);
}

type SidebarTabTarget = ReturnType<typeof getSidebarTabTarget>;

export interface SidebarTabsDependencies {
  navigate: (target: SidebarTabTarget) => Promise<void>;
  pathname: string;
  preloadRoute: (target: SidebarTabTarget) => Promise<readonly object[] | undefined>;
  slug: string;
}

export function SidebarTabsView({ dependencies }: { dependencies: SidebarTabsDependencies }) {
  const activeTab = resolveSidebarTab(dependencies.pathname);

  const handleChange = async (value: string) => {
    if (value !== "agent" && value !== "studio") {
      return;
    }
    const nextTab = value;
    const target = getSidebarTabTarget(nextTab, dependencies.slug);

    if (nextTab !== activeTab) {
      try {
        await dependencies.navigate(target);
      } catch {
        // The current route remains usable when navigation is rejected.
      }
    }
  };

  const preloadTab = async (tab: SidebarTabValue) => {
    if (tab === activeTab) {
      return;
    }
    try {
      await dependencies.preloadRoute(getSidebarTabTarget(tab, dependencies.slug));
    } catch {
      // A failed speculative preload must not prevent the later navigation.
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 group-data-[collapsible=icon]:gap-0">
      <RecruitmentCopilotBrand />
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
        <TabsList className="w-full select-none bg-sidebar-accent dark:bg-black/15">
          <TabsTrigger
            onFocus={() => {
              preloadTab("agent");
            }}
            onPointerEnter={() => {
              preloadTab("agent");
            }}
            onTouchStart={() => {
              preloadTab("agent");
            }}
            value="agent"
          >
            智能体
          </TabsTrigger>
          <TabsTrigger
            onFocus={() => {
              preloadTab("studio");
            }}
            onPointerEnter={() => {
              preloadTab("studio");
            }}
            onTouchStart={() => {
              preloadTab("studio");
            }}
            value="studio"
          >
            工作台
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const slug = useWorkspaceSlug();

  return (
    <SidebarTabsView
      dependencies={{
        navigate,
        pathname,
        preloadRoute: router.preloadRoute,
        slug,
      }}
    />
  );
}
