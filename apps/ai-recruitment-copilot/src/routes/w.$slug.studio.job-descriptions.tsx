import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { JobDescriptionManagementPage } from "@/components/features/studio/job-descriptions/job-description-management-page";
import { JobDescriptionsPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioJobDescriptionsState } from "@/lib/start/studio/job-descriptions.functions";
import type { StudioJobDescriptionsState } from "@/lib/start/studio/job-descriptions.functions";

function StudioJobDescriptionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/job-descriptions",
  }) as unknown as StudioJobDescriptionsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <JobDescriptionManagementPage
      departments={state.departments}
      interviewers={state.interviewers}
      metrics={state.metrics}
    />
  );
}

export const Route = createFileRoute("/w/$slug/studio/job-descriptions")({
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
  loader: async ({ params }) => {
    const state = (await loadStudioJobDescriptionsState({
      data: { slug: params.slug },
    })) as StudioJobDescriptionsState;
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
    meta: [{ title: formatDocumentTitle("岗位设置") }],
  }),
  component: StudioJobDescriptionsRoute,
  pendingComponent: JobDescriptionsPageSkeleton,
  shouldReload: false,
});
