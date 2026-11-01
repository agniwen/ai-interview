"use client";

import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useSidebar } from "@/components/ui/sidebar";
import { useHasPermission } from "@/hooks/use-has-permission";
import { resolveSidebarTab } from "./sidebar-slot-transition";
import type { SidebarTabValue } from "./sidebar-slot-transition";

function getSidebarTabTarget(tab: SidebarTabValue, slug: string) {
  return tab === "agent"
    ? ({ params: { slug }, to: "/w/$slug/agent" } as const)
    : ({ params: { slug }, to: "/w/$slug/studio" } as const);
}

type SidebarTabTarget = ReturnType<typeof getSidebarTabTarget>;

export interface SidebarTabsDependencies {
  navigate: (target: SidebarTabTarget) => Promise<void>;
  pathname: string;
  preloadRoute: (target: SidebarTabTarget) => Promise<readonly object[] | undefined>;
  slug: string;
}

export function SidebarTabsView({
  canUseAgent = true,
  dependencies,
}: {
  /** 没有招聘助手权限时只剩工作台，不再显示标签切换。Hidden when only the studio is available. */
  canUseAgent?: boolean;
  dependencies: SidebarTabsDependencies;
}) {
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

  if (!canUseAgent) {
    return null;
  }

  return (
    <div className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity,transform] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[collapsible=icon]:grid-rows-[0fr] group-data-[collapsible=icon]:-translate-x-2 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
      <div className="min-h-0 overflow-hidden">
        <Tabs
          // Manual activation: Radix's default "automatic" mode calls
          // onValueChange on focus — when sonner restores focus to the
          // previously-active tab trigger after dismissing a toast, that
          // would route us back to the wrong tab.
          activationMode="manual"
          className="w-full"
          onValueChange={handleChange}
          value={activeTab ?? "agent"}
        >
          <TabsList className="w-full select-none">
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
    </div>
  );
}

export function SidebarTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const slug = useWorkspaceSlug();
  const { isMobile, state } = useSidebar();
  const canUseAgent = useHasPermission("chat", "read");

  return (
    <div inert={!isMobile && state === "collapsed"}>
      <SidebarTabsView
        canUseAgent={canUseAgent}
        dependencies={{
          navigate,
          pathname,
          preloadRoute: router.preloadRoute,
          slug,
        }}
      />
    </div>
  );
}
