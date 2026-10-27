import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SiteHeader } from "@/components/features/studio/site-header";
import { StudioHeaderProvider } from "@/components/features/studio/studio-header-context";
import {
  StudioContentOverlayProvider,
  StudioContentOverlayTarget,
} from "@/components/features/studio/studio-content-route-overlay";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@app/shared/utils";

import { StudioSidePaneProvider } from "./studio-side-pane-context";
import { StudioSidePane } from "./studio-side-pane";
// 侧栏展开/收起过渡期间（sidebar-wrapper 带 data-sidebar-transition=目标状态），桌面端内容区直接取过渡结束后的最终宽度：
// 只重排一次，过渡中仅随左边缘平移并被 SidebarInset 裁剪；静止时恢复 w-full，不依赖下面的宽度算式。
// 最终宽度 = 视口 - 侧栏占位(inset 变体收起时为 icon 宽 + 1rem) - 内容区外边距（始终仅 mr-2；sidebar 占位已包含左右内边距）。
// While the sidebar width transitions, desktop content takes its final width so it relayouts once instead of every frame.
const STUDIO_CONTENT_TRANSITION_WIDTH_CLASS =
  "md:group-data-[sidebar-transition=expanded]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width)-0.5rem)] md:group-data-[sidebar-transition=collapsed]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width-icon)-1.5rem)]";

export function StudioLayout({ children }: { children: ReactNode }) {
  const slug = useWorkspaceSlug();
  const isApprovalEditor = useRouterState({
    select: (state) =>
      /\/studio\/offer-approval-templates\/[^/]+\/?$/.test(state.location.pathname),
  });
  return (
    <StudioHeaderProvider>
      <StudioSidePaneProvider scopeKey={slug}>
        <StudioContentOverlayProvider>
          <div className="flex h-dvh min-w-0 flex-1 flex-col md:m-2 md:ml-0 md:h-[calc(100dvh-1rem)] ">
            <div
              className={cn(
                "@container/studio-workspace flex min-h-0 flex-1 gap-2",
                STUDIO_CONTENT_TRANSITION_WIDTH_CLASS,
              )}
            >
              <SidebarInset className="min-h-0 min-w-0 overflow-hidden md:rounded-2xl md:shadow-default dark:md:shadow-none dark:md:ring-[0.5px] dark:md:ring-border">
                {isApprovalEditor ? (
                  <>
                    <SiteHeader className="pointer-events-none absolute inset-x-0 top-0 [&>div]:pointer-events-auto" />
                    <PendingOutlet className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                      {children}
                    </PendingOutlet>
                  </>
                ) : (
                  <ScrollArea
                    className="min-h-0 flex-1 bg-background [&_[data-overlayscrollbars-viewport]]:z-auto!"
                    scrollRestorationId={STUDIO_MAIN_SCROLL_RESTORATION_ID}
                  >
                    <SiteHeader className="left-0" />
                    <PendingOutlet className="@container/main flex w-[100cqw] min-w-full flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
                      {children}
                    </PendingOutlet>
                  </ScrollArea>
                )}
                <StudioContentOverlayTarget className="pointer-events-none absolute inset-0 z-10" />
              </SidebarInset>
              <StudioSidePane />
            </div>
          </div>
        </StudioContentOverlayProvider>
      </StudioSidePaneProvider>
    </StudioHeaderProvider>
  );
}
