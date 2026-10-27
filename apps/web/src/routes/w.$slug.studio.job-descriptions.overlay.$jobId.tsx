import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { JobDescriptionEditPage } from "@/components/features/studio/job-descriptions/job-description-edit-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

const parentRoute = getRouteApi("/w/$slug/studio/job-descriptions");
const editorRoute = getRouteApi("/w/$slug/studio/job-descriptions/overlay/$jobId");
function EditorRoute() {
  const { jobId, slug } = editorRoute.useParams();
  const search = editorRoute.useSearch();
  const state = parentRoute.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const onBack = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({ to: "/w/$slug/studio/job-descriptions", params: { slug }, search });
  }, [navigate, router, search, slug]);
  if (state.status !== "ready") {
    return null;
  }
  const page = (
    <JobDescriptionEditPage
      jobId={jobId}
      onBack={onBack}
      departments={state.departments}
      interviewers={state.interviewers}
    />
  );
  return <StudioContentRouteOverlay>{page}</StudioContentRouteOverlay>;
}
export const Route = createFileRoute("/w/$slug/studio/job-descriptions/overlay/$jobId")({
  validateSearch: coerceSearchParams,
  head: () => ({ meta: [{ title: formatDocumentTitle("编辑岗位") }] }),
  component: EditorRoute,
});
