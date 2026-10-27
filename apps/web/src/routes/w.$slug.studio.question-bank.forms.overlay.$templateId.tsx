import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { CandidateFormEditPage } from "@/components/features/studio/forms/form-template-edit-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/question-bank/forms");
const editorRoute = getRouteApi("/w/$slug/studio/question-bank/forms/overlay/$templateId");
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
      to: "/w/$slug/studio/question-bank/forms",
      params: { slug },
      search,
    });
  }, [navigate, router, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <CandidateFormEditPage
      templateId={templateId}
      onBack={onBack}
      jobDescriptions={state.jobDescriptions}
    />
  );
  return <StudioContentRouteOverlay>{page}</StudioContentRouteOverlay>;
}
export const Route = createFileRoute("/w/$slug/studio/question-bank/forms/overlay/$templateId")({
  validateSearch: coerceSearchParams,
  head: () => ({ meta: [{ title: formatDocumentTitle("编辑表单题") }] }),
  component: EditorRoute,
});
