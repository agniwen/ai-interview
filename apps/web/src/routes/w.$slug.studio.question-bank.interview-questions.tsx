import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { InterviewQuestionTemplateManagementPage } from "@/components/features/studio/interview-questions/interview-question-template-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";

const routeApi = getRouteApi("/w/$slug/studio/question-bank/interview-questions");

function StudioInterviewQuestionsRoute() {
  const state = routeApi.useLoaderData();
  return state.status === "ready" ? (
    <InterviewQuestionTemplateManagementPage jobDescriptions={state.jobDescriptions} />
  ) : null;
}

// 页面权限由父路由「面试题配置」校验，服务端函数同样按页面权限鉴权。
// The question bank parent route checks the page permission; the server function re-checks it.
export const Route = createFileRoute("/w/$slug/studio/question-bank/interview-questions")({
  validateSearch: coerceSearchParams,
  loader: async ({ params }) => {
    const state = await loadStudioInterviewQuestionsState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/question-bank/interview-questions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("沟通题 · 面试题配置") }] }),
  component: StudioInterviewQuestionsRoute,
  pendingComponent: () => (
    <StudioTablePageSkeleton columnCount={8} filterCount={3} header={false} label="沟通题" />
  ),
  shouldReload: false,
});
