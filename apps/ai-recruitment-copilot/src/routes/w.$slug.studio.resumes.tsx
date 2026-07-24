import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { formatDocumentTitle } from "@/lib/start/document-title";
import {
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { loadStudioResumesState } from "@/lib/start/studio/resumes.functions";
import type { StudioResumesState } from "@/lib/start/studio/resumes.functions";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";

import { RecruitingPageSkeleton } from "@/components/features/studio/studio-page-skeletons";

import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";
import {
  coerceSearchParams,
  parseResumeQuery,
} from "@/components/features/studio/resumes/resume-library-page-model";
import type { SearchParamsRecord } from "@/components/features/studio/resumes/resume-library-page-model";
function StudioResumesRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/resumes",
  }) as unknown as StudioResumesState;
  const { slug } = useParams({ from: "/w/$slug/studio/resumes" });
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  if (state.status !== "ready") {
    return null;
  }

  if (pathname !== `/w/${slug}/studio/resumes`) {
    return <Outlet />;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <ResumeLibraryPage metrics={state.metrics} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes")({
  component: StudioResumesRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("招聘台") }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { pathname: string; search: SearchParamsRecord };
      params: { slug: string };
    };
    const isListRoute = location.pathname === `/w/${params.slug}/studio/resumes`;
    const query = parseResumeQuery(location.search);
    await requireStudioPageAccess({
      action: "resumes",
      pathname: `/w/${params.slug}/studio/resumes`,
      slug: params.slug,
    });
    const state = (await loadStudioResumesState({
      data: { prefetchList: isListRoute, query, slug: params.slug },
    })) as StudioResumesState;
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
  pendingComponent: RecruitingPageSkeleton,
  shouldReload: false,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
