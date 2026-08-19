import type { ReactNode } from "react";
import { Outlet, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { PendingOutlet } from "@/components/layout/pending-outlet";
import { SiteHeader } from "@/components/features/studio/site-header";
import { StudioHeaderProvider } from "@/components/features/studio/studio-header-context";
import { documentTitleMeta } from "@/lib/start/document-title";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset } from "@/components/ui/sidebar";
import { getFirstAllowedStudioPagePath } from "@/lib/start/auth-session";
import { STUDIO_PAGE_PATHS } from "@/lib/start/studio-page-paths";
import { hasPermissionInStatements } from "@arc/shared/permission-statements";

function findStudioPageByPath(pathname: string, slug: string) {
  const studioBasePath = `/w/${slug}/studio`;
  const relativePath = pathname.slice(studioBasePath.length) || "/";
  return STUDIO_PAGE_PATHS.find(
    (item) => relativePath === item.path || relativePath.startsWith(`${item.path}/`),
  );
}

async function findFirstAllowedStudioPath(slug: string) {
  return await getFirstAllowedStudioPagePath({ data: { slug } });
}

function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioHeaderProvider>
      <SidebarInset className="h-dvh overflow-hidden border border-border md:h-[calc(100dvh-1rem)] md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2">
        <ScrollArea
          className="@container/main min-h-0 flex-1 bg-background"
          scrollRestorationId={STUDIO_MAIN_SCROLL_RESTORATION_ID}
        >
          <SiteHeader />
          <PendingOutlet className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
            {children}
          </PendingOutlet>
        </ScrollArea>
      </SidebarInset>
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
