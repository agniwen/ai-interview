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

import { ResumeLibraryPage } from "@/components/features/studio/resumes/resume-library-page";
import { coerceSearchParams } from "@/components/features/studio/resumes/resume-library-page-model";
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

  return <ResumeLibraryPage />;
}

export const Route = createFileRoute("/w/$slug/studio/resumes")({
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
  loader: async (loaderContext) => {
    const { params } = loaderContext as unknown as { params: { slug: string } };
    const state = (await loadStudioResumesState({
      data: { slug: params.slug },
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
  head: () => ({
    meta: [{ title: formatDocumentTitle("招聘台") }],
  }),
  component: StudioResumesRoute,
  shouldReload: false,
});
