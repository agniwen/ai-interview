import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { InterviewQuestionEditPage } from "@/components/features/studio/interview-questions/interview-question-edit-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/question-bank/interview-questions");
const editorRoute = getRouteApi(
  "/w/$slug/studio/question-bank/interview-questions/overlay/$templateId",
);
function EditorRoute() {
  const { templateId, slug } = editorRoute.useParams();
  const search = editorRoute.useSearch();
  const state = parentRoute.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const onBack = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      to: "/w/$slug/studio/question-bank/interview-questions",
      params: { slug },
      search,
    });
  }, [navigate, router, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <InterviewQuestionEditPage
      templateId={templateId}
      onBack={onBack}
      jobDescriptions={state.jobDescriptions}
    />
  );
  return <StudioContentRouteOverlay>{page}</StudioContentRouteOverlay>;
}
export const Route = createFileRoute(
  "/w/$slug/studio/question-bank/interview-questions/overlay/$templateId",
)({
  validateSearch: coerceSearchParams,
  head: () => ({ meta: [{ title: formatDocumentTitle("编辑沟通题") }] }),
  component: EditorRoute,
});
