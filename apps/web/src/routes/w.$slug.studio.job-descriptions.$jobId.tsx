import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { JobDescriptionEditPage } from "@/components/features/studio/job-descriptions/job-description-edit-page";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/job-descriptions");
const editorRoute = getRouteApi("/w/$slug/studio/job-descriptions/$jobId");
function EditorRoute() {
  const { jobId, slug } = editorRoute.useParams();
  const search = editorRoute.useSearch();
  const state = parentRoute.useLoaderData();
  const navigate = useNavigate();
  const onBack = useCallback(() => {
    void navigate({ to: "/w/$slug/studio/job-descriptions", params: { slug }, search });
  }, [navigate, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <JobDescriptionEditPage
      jobId={jobId}
      onBack={onBack}
      onCreated={(id) => {
        void navigate({
          to: "/w/$slug/studio/job-descriptions/$jobId",
          params: { slug, jobId: id },
          search,
          replace: true,
        });
      }}
      departments={state.departments}
      interviewers={state.interviewers}
    />
  );
  return page;
}
export const Route = createFileRoute("/w/$slug/studio/job-descriptions/$jobId")({
  validateSearch: coerceSearchParams,
  head: ({ params }) => ({
    meta: [{ title: formatDocumentTitle(params.jobId === "new" ? "新建岗位" : "编辑岗位") }],
  }),
  component: EditorRoute,
});
