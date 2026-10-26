import type { ReactNode } from "react";
import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SiteHeader } from "@/components/features/studio/site-header";
import { StudioHeaderProvider } from "@/components/features/studio/studio-header-context";
import {
  StudioContentOverlayProvider,
  StudioContentOverlayTarget,
} from "@/components/features/studio/studio-content-route-overlay";
import { documentTitleMeta } from "@/lib/start/document-title";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { cn } from "@app/shared/utils";

// 侧栏展开/收起过渡期间（sidebar-wrapper 带 data-sidebar-transition=目标状态），桌面端内容区直接取过渡结束后的最终宽度：
// 只重排一次，过渡中仅随左边缘平移并被 SidebarInset 裁剪；静止时恢复 w-full，不依赖下面的宽度算式。
// 最终宽度 = 视口 - 侧栏占位(inset 变体收起时为 icon 宽 + 1rem) - SidebarInset 外边距(展开 mr-2，收起 mx-2)。
// While the sidebar width transitions, desktop content takes its final width so it relayouts once instead of every frame.
const STUDIO_CONTENT_TRANSITION_WIDTH_CLASS =
  "md:group-data-[sidebar-transition=expanded]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width)-0.5rem)] md:group-data-[sidebar-transition=collapsed]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width-icon)-2rem)]";

function StudioLayout({ children }: { children: ReactNode }) {
  const isApprovalEditor = useRouterState({
    select: (state) =>
      /\/studio\/offer-approval-templates\/[^/]+\/?$/.test(state.location.pathname),
  });
  return (
    <StudioHeaderProvider>
      <StudioContentOverlayProvider>
        <SidebarInset className="h-dvh overflow-hidden md:h-[calc(100dvh-1rem)] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2">
          {isApprovalEditor ? (
            <>
              <SiteHeader
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 [&>div]:pointer-events-auto",
                  STUDIO_CONTENT_TRANSITION_WIDTH_CLASS,
                )}
              />
              <PendingOutlet
                className={cn(
                  "relative flex min-h-0 flex-1 flex-col overflow-hidden",
                  STUDIO_CONTENT_TRANSITION_WIDTH_CLASS,
                )}
              >
                {children}
              </PendingOutlet>
            </>
          ) : (
            <ScrollArea
              className={cn(
                "@container/main min-h-0 flex-1 bg-background [&_[data-overlayscrollbars-viewport]]:z-auto!",
                STUDIO_CONTENT_TRANSITION_WIDTH_CLASS,
              )}
              scrollRestorationId={STUDIO_MAIN_SCROLL_RESTORATION_ID}
            >
              <SiteHeader />
              <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
                {children}
              </PendingOutlet>
            </ScrollArea>
          )}
          <StudioContentOverlayTarget
            className={cn(
              "pointer-events-none absolute inset-0 z-10",
              STUDIO_CONTENT_TRANSITION_WIDTH_CLASS,
            )}
          />
        </SidebarInset>
      </StudioContentOverlayProvider>
    </StudioHeaderProvider>
  );
}

function StudioShellRoute() {
  return (
    <StudioLayout>
      <Outlet />
    </StudioLayout>
  );
}

export const Route = createFileRoute("/w/$slug/studio")({
  ssr: "data-only",
  // Page permissions are checked by each page route; see requireStudioPagePermission.
  loader: async ({ parentMatchPromise }) => {
    const workspaceMatch = await parentMatchPromise;
    return workspaceMatch.loaderData ?? null;
  },
  head: ({ matches }) => ({
    meta: [
      {
        content: "Studio 管理后台。",
        name: "description",
      },
      ...documentTitleMeta(matches),
    ],
  }),
  component: StudioShellRoute,
});
