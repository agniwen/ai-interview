import { formatDocumentTitle } from "@/lib/start/document-title";
import {
  Outlet,
  createFileRoute,
  getRouteApi,
  notFound,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";
import { coerceSearchParams } from "@/components/features/studio/resumes/resume-library-page-model";

const studioResumesRouteApi = getRouteApi("/w/$slug/studio/resumes");

function StudioResumesRoute() {
  const state = studioResumesRouteApi.useLoaderData();
  const activeRouteId = useRouterState({
    select: (routerState) => routerState.matches.at(-1)?.routeId,
  });
  const isListRoute = activeRouteId === "/w/$slug/studio/resumes";
  const isOverlayRoute = activeRouteId === "/w/$slug/studio/resumes/overlay/$recordId";

  if (state.status !== "ready") {
    return null;
  }

  return (
    <>
      {isListRoute || isOverlayRoute ? (
        <div
          aria-hidden={isOverlayRoute ? true : undefined}
          className="contents"
          inert={isOverlayRoute ? true : undefined}
        >
          <ResumeLibraryPage />
        </div>
      ) : null}
      {isListRoute ? null : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes")({
  validateSearch: coerceSearchParams,
  loader: async ({ params }) => {
    const { loadStudioResumesState } = await import("@/lib/start/studio/resumes.functions");
    const state = await loadStudioResumesState({
      data: { slug: params.slug },
    });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/resumes`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("招聘台") }],
  }),
  component: StudioResumesRoute,
  shouldReload: false,
});
