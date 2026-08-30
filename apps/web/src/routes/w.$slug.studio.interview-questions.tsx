import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { InterviewQuestionTemplateManagementPage } from "@/components/features/studio/interview-questions/interview-question-template-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";

const routeApi = getRouteApi("/w/$slug/studio/interview-questions");

function StudioInterviewQuestionsRoute() {
  const state = routeApi.useLoaderData();
  return state.status === "ready" ? (
    <InterviewQuestionTemplateManagementPage jobDescriptions={state.jobDescriptions} />
  ) : null;
}

export const Route = createFileRoute("/w/$slug/studio/interview-questions")({
  validateSearch: coerceSearchParams,
  loader: async ({ params }) => {
    const state = await loadStudioInterviewQuestionsState({
      data: { slug: params.slug },
    });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/interview-questions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("沟通题") }] }),
  component: StudioInterviewQuestionsRoute,
  pendingComponent: () => (
    <StudioTablePageSkeleton columnCount={8} filterCount={3} label="沟通题" />
  ),
  shouldReload: false,
});
