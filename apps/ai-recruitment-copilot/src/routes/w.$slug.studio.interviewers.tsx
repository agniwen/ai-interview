import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { InterviewerManagementPage } from "@/components/features/studio/interviewers/interviewer-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioInterviewersState } from "@/lib/start/studio/interviewers.functions";

const routeApi = getRouteApi("/w/$slug/studio/interviewers");

function StudioInterviewersRoute() {
  const state = routeApi.useLoaderData();
  return state.status === "ready" ? (
    <InterviewerManagementPage departments={state.departments} />
  ) : null;
}

export const Route = createFileRoute("/w/$slug/studio/interviewers")({
  validateSearch: coerceSearchParams,
  loader: async ({ params }) => {
    const state = await loadStudioInterviewersState({
      data: { slug: params.slug },
    });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/interviewers`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("AI面试官管理") }] }),
  component: StudioInterviewersRoute,
  pendingComponent: () => <StudioTablePageSkeleton label="AI面试官管理" />,
  shouldReload: false,
});
