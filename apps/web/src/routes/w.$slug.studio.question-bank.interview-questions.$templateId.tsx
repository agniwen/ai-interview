import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { InterviewQuestionEditPage } from "@/components/features/studio/interview-questions/interview-question-edit-page";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/question-bank/interview-questions");
const editorRoute = getRouteApi("/w/$slug/studio/question-bank/interview-questions/$templateId");
function EditorRoute() {
  const { templateId, slug } = editorRoute.useParams();
  const search = editorRoute.useSearch();
  const state = parentRoute.useLoaderData();
  const navigate = useNavigate();
  const onBack = useCallback(() => {
    void navigate({
      to: "/w/$slug/studio/question-bank/interview-questions",
      params: { slug },
      search,
    });
  }, [navigate, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <InterviewQuestionEditPage
      templateId={templateId}
      onBack={onBack}
      onCreated={(id) => {
        void navigate({
          to: "/w/$slug/studio/question-bank/interview-questions/$templateId",
          params: { slug, templateId: id },
          search,
          replace: true,
        });
      }}
      jobDescriptions={state.jobDescriptions}
    />
  );
  return page;
}
export const Route = createFileRoute(
  "/w/$slug/studio/question-bank/interview-questions/$templateId",
)({
  validateSearch: coerceSearchParams,
  head: ({ params }) => ({
    meta: [
      { title: formatDocumentTitle(params.templateId === "new" ? "新建沟通题" : "编辑沟通题") },
    ],
  }),
  component: EditorRoute,
});
