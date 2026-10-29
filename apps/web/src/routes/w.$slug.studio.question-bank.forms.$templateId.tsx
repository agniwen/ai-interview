import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CandidateFormEditPage } from "@/components/features/studio/forms/form-template-edit-page";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/question-bank/forms");
const editorRoute = getRouteApi("/w/$slug/studio/question-bank/forms/$templateId");
function EditorRoute() {
  const { templateId, slug } = editorRoute.useParams();
  const search = editorRoute.useSearch();
  const state = parentRoute.useLoaderData();
  const navigate = useNavigate();
  const onBack = useCallback(() => {
    void navigate({
      to: "/w/$slug/studio/question-bank/forms",
      params: { slug },
      search,
    });
  }, [navigate, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <CandidateFormEditPage
      templateId={templateId}
      onBack={onBack}
      onCreated={(id) => {
        void navigate({
          to: "/w/$slug/studio/question-bank/forms/$templateId",
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
export const Route = createFileRoute("/w/$slug/studio/question-bank/forms/$templateId")({
  validateSearch: coerceSearchParams,
  head: ({ params }) => ({
    meta: [
      { title: formatDocumentTitle(params.templateId === "new" ? "新建表单题" : "编辑表单题") },
    ],
  }),
  component: EditorRoute,
});
