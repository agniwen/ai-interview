import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { InterviewQuestionTemplateManagementPage } from "@/components/features/studio/interview-questions/interview-question-template-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";
import type { StudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";

function StudioInterviewQuestionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/interview-questions",
  }) as unknown as StudioInterviewQuestionsState;
  return state.status === "ready" ? (
    <InterviewQuestionTemplateManagementPage jobDescriptions={state.jobDescriptions} />
  ) : null;
}

export const Route = createFileRoute("/w/$slug/studio/interview-questions")({
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
  loader: async ({ params }) => {
    const state = (await loadStudioInterviewQuestionsState({
      data: { slug: params.slug },
    })) as StudioInterviewQuestionsState;
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
  pendingComponent: () => <StudioTablePageSkeleton filterCount={3} label="沟通题" />,
  shouldReload: false,
});
