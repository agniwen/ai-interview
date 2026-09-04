import {
  createFileRoute,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback } from "react";
import {
  RecruiterResumeDetailPage,
  RecruiterResumeDetailSkeleton,
} from "@/components/features/studio/resumes/recruiter-resume-detail-page";
import {
  buildResumeDetailTabSearch,
  listSearchFromDetailSearch,
  resumeDetailPageSearchSchema,
} from "@/components/features/studio/resumes/recruiter-resume-detail-search";
import type { StudioPersonDetailTab } from "@/components/features/studio/studio-person-detail-panel";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { formatDocumentTitle } from "@/lib/start/document-title";

const OVERLAY_ROUTE = "/w/$slug/studio/resumes/overlay/$recordId" as const;

function RecruiterResumeDetailOverlayRoute() {
  const navigate = useNavigate({ from: OVERLAY_ROUTE });
  const { recordId, slug } = useParams({ from: OVERLAY_ROUTE });
  const router = useRouter();
  const routeSearch = useSearch({ from: OVERLAY_ROUTE });

  const navigateBackToList = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      search: listSearchFromDetailSearch(routeSearch),
      to: "/w/$slug/studio/resumes",
    });
  }, [navigate, routeSearch, router, slug]);

  const showAiInterview = useCallback(() => {
    void navigate({
      resetScroll: false,
      search: (previous) => buildResumeDetailTabSearch(previous, "rounds"),
    });
  }, [navigate]);

  const changeTab = useCallback(
    (tab: StudioPersonDetailTab) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (previous) => buildResumeDetailTabSearch(previous, tab),
      });
    },
    [navigate],
  );

  return (
    <StudioContentRouteOverlay>
      <RecruiterResumeDetailPage
        onBack={navigateBackToList}
        onShowAiInterview={showAiInterview}
        onTabChange={changeTab}
        recordId={recordId}
        routeSearch={routeSearch}
      />
    </StudioContentRouteOverlay>
  );
}

function RecruiterResumeDetailOverlayPending() {
  return (
    <StudioContentRouteOverlay>
      <RecruiterResumeDetailSkeleton />
    </StudioContentRouteOverlay>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes/overlay/$recordId")({
  validateSearch: resumeDetailPageSearchSchema,
  head: () => ({
    meta: [{ title: formatDocumentTitle("候选人详情") }],
  }),
  component: RecruiterResumeDetailOverlayRoute,
  pendingComponent: RecruiterResumeDetailOverlayPending,
});
