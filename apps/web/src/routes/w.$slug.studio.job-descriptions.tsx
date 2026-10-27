import {
  Outlet,
  useRouterState,
  createFileRoute,
  getRouteApi,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { JobDescriptionManagementPage } from "@/components/features/studio/job-descriptions/job-description-management-page";
import { JobDescriptionsPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioJobDescriptionsState } from "@/lib/start/studio/job-descriptions.functions";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

const routeApi = getRouteApi("/w/$slug/studio/job-descriptions");

function StudioJobDescriptionsRoute() {
  const state = routeApi.useLoaderData();
  const activeRouteId = useRouterState({
    select: (routerState) => routerState.matches.at(-1)?.routeId,
  });
  const isList = activeRouteId === "/w/$slug/studio/job-descriptions";
  const isOverlay = activeRouteId?.startsWith("/w/$slug/studio/job-descriptions/overlay/") ?? false;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <>
      {isList || isOverlay ? (
        <div
          className="contents"
          aria-hidden={isOverlay || undefined}
          inert={isOverlay || undefined}
        >
          <JobDescriptionManagementPage
            departments={state.departments}
            interviewers={state.interviewers}
          />
        </div>
      ) : null}
      {isList ? null : <Outlet />}
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/job-descriptions")({
  validateSearch: coerceSearchParams,
  loader: async ({ params, parentMatchPromise }) => {
    await requireStudioPagePermission(parentMatchPromise, "jobDescriptions");
    const state = await loadStudioJobDescriptionsState({
      data: { slug: params.slug },
    });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/job-descriptions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("岗位") }],
  }),
  component: StudioJobDescriptionsRoute,
  pendingComponent: JobDescriptionsPageSkeleton,
  shouldReload: false,
});
