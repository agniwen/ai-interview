import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

import { ResumePoolPage } from "@/components/features/studio/resume-pool/resume-pool-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { ResumePoolPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

function StudioExternalApplicationsRoute() {
  const activeRouteId = useRouterState({
    select: (routerState) => routerState.matches.at(-1)?.routeId,
  });
  const isListRoute = activeRouteId === "/w/$slug/studio/external-applications";
  const isOverlayRoute =
    activeRouteId === "/w/$slug/studio/external-applications/overlay/$recordId";

  return (
    <>
      {isListRoute || isOverlayRoute ? (
        <div
          aria-hidden={isOverlayRoute ? true : undefined}
          className="contents"
          inert={isOverlayRoute ? true : undefined}
        >
          <ResumePoolPage externalOnly />
        </div>
      ) : null}
      {isListRoute ? null : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/external-applications")({
  loader: ({ parentMatchPromise }) => requireStudioPagePermission(parentMatchPromise, "resumePool"),
  head: () => ({
    meta: [{ title: formatDocumentTitle("外部投递") }],
  }),
  component: StudioExternalApplicationsRoute,
  pendingComponent: ResumePoolPageSkeleton,
  shouldReload: false,
});
