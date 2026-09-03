import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

import { ResumePoolPage } from "@/components/features/studio/resume-pool/resume-pool-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { ResumePoolPageSkeleton } from "@/components/features/studio/studio-page-skeletons";

function StudioResumePoolRoute() {
  const activeRouteId = useRouterState({
    select: (routerState) => routerState.matches.at(-1)?.routeId,
  });
  const isListRoute = activeRouteId === "/w/$slug/studio/resume-pool";
  const isOverlayRoute = activeRouteId === "/w/$slug/studio/resume-pool/overlay/$recordId";

  return (
    <>
      {isListRoute || isOverlayRoute ? (
        <div
          aria-hidden={isOverlayRoute ? true : undefined}
          className="contents"
          inert={isOverlayRoute ? true : undefined}
        >
          <ResumePoolPage />
        </div>
      ) : null}
      {isListRoute ? null : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resume-pool")({
  head: () => ({
    meta: [{ title: formatDocumentTitle("人才库") }],
  }),
  component: StudioResumePoolRoute,
  pendingComponent: ResumePoolPageSkeleton,
  shouldReload: false,
});
