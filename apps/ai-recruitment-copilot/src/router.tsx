import { createRouteMask, createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFoundPage } from "@/components/layout/not-found-view";
import { RoutePendingView } from "@/components/layout/route-pending-view";
import { getQueryClient } from "@/lib/client/query-client";
import { routeTree } from "./routeTree.gen";

const recruiterResumeOverlayMask = createRouteMask({
  from: "/w/$slug/studio/resumes/overlay/$recordId",
  params: true,
  routeTree,
  search: true,
  to: "/w/$slug/studio/resumes/$recordId",
  unmaskOnReload: true,
});

const RECRUITER_RESUME_DETAIL_PATH = /^\/w\/[^/]+\/studio\/resumes\/[^/]+\/?$/;

function getRecruiterResumeDetailScrollToTopElement() {
  const currentLocation = globalThis.location;
  if (!currentLocation || !RECRUITER_RESUME_DETAIL_PATH.test(currentLocation.pathname)) {
    return;
  }
  return document.querySelector('[data-scroll-restoration-id="studio-main-scroll"]');
}

function DefaultNotFoundComponent() {
  return <NotFoundPage />;
}

function DefaultPendingComponent() {
  return <RoutePendingView />;
}

export function getRouter() {
  const queryClient = getQueryClient();
  const router = createRouter({
    context: { queryClient },
    defaultNotFoundComponent: DefaultNotFoundComponent,
    defaultPendingComponent: DefaultPendingComponent,
    defaultPendingMinMs: 300,
    defaultPendingMs: 350,
    defaultPreload: "intent",
    notFoundMode: "root",
    routeMasks: [recruiterResumeOverlayMask],
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: [getRecruiterResumeDetailScrollToTopElement],
  });

  setupRouterSsrQueryIntegration({ queryClient, router });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
