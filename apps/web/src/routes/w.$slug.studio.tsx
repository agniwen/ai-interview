import type { ReactNode } from "react";
import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
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
import { STUDIO_PAGE_PATHS } from "@/lib/start/studio-page-paths";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import { cn } from "@app/shared/utils";

function findStudioPageByPath(pathname: string, slug: string) {
  const studioBasePath = `/w/${slug}/studio`;
  const relativePath = pathname.slice(studioBasePath.length) || "/";
  return STUDIO_PAGE_PATHS.find(
    (item) => relativePath === item.path || relativePath.startsWith(`${item.path}/`),
  );
}

async function findFirstAllowedStudioPath(slug: string) {
  const { getFirstAllowedStudioPagePath } = await import("@/lib/start/auth-session");
  return await getFirstAllowedStudioPagePath({ data: { slug } });
}

// 侧栏展开/收起过渡期间（Sidebar 根节点带 data-transitioning），桌面端内容区直接取过渡结束后的最终宽度：
// 只重排一次，过渡中仅随左边缘平移并被 SidebarInset 裁剪；静止时恢复 w-full，不依赖下面的宽度算式。
// 最终宽度 = 视口 - 侧栏占位(inset 变体收起时为 icon 宽 + 1rem) - SidebarInset 外边距(展开 mr-2，收起 mx-2)。
// While the sidebar width transitions, desktop content takes its final width so it relayouts once instead of every frame.
const STUDIO_CONTENT_TRANSITION_WIDTH_CLASS =
  "md:group-has-[[data-slot=sidebar][data-transitioning][data-state=expanded]]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width)-0.5rem)] md:group-has-[[data-slot=sidebar][data-transitioning][data-state=collapsed]]/sidebar-wrapper:w-[calc(100vw-var(--sidebar-width-icon)-2rem)]";

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
  loader: async (loaderContext) => {
    const { location, params, parentMatchPromise } = loaderContext;

    if (location.pathname === `/w/${params.slug}/studio`) {
      const fallbackPath = await findFirstAllowedStudioPath(params.slug);
      if (!fallbackPath) {
        throw notFound();
      }
      throw redirect({ href: `/w/${params.slug}/studio${fallbackPath}` });
    }

    const requestedPage = findStudioPageByPath(location.pathname, params.slug);
    if (!requestedPage) {
      return null;
    }

    const parentMatch = await parentMatchPromise;
    const state = parentMatch.loaderData;
    if (
      !state ||
      state.status !== "ready" ||
      !hasPermissionInStatements(state.permissions, "page", requestedPage.action)
    ) {
      throw notFound();
    }

    return null;
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
