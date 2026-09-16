import {
  createFileRoute,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";
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
import { formatDocumentTitle } from "@/lib/start/document-title";

const recruiterResumeListLocationStateSchema = z.object({
  fromRecruiterResumeList: z.literal(true).optional(),
  fromStudioCalendar: z.literal(true).optional(),
});

function RecruiterResumeDetailRoute() {
  const navigate = useNavigate({ from: "/w/$slug/studio/resumes/$recordId" });
  const { recordId, slug } = useParams({ from: "/w/$slug/studio/resumes/$recordId" });
  const router = useRouter();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes/$recordId" });
  const locationState = recruiterResumeListLocationStateSchema.safeParse(
    router.state.location.state,
  );
  const fromStudioCalendar = locationState.data?.fromStudioCalendar === true;

  const navigateBackToList = useCallback(() => {
    if (
      (locationState.data?.fromRecruiterResumeList || fromStudioCalendar) &&
      router.history.canGoBack()
    ) {
      router.history.back();
      return;
    }
    if (fromStudioCalendar) {
      void navigate({ params: { slug }, to: "/w/$slug/studio/calendar" });
      return;
    }
    void navigate({
      params: { slug },
      search: listSearchFromDetailSearch(routeSearch),
      to: "/w/$slug/studio/resumes",
    });
  }, [
    fromStudioCalendar,
    locationState.data?.fromRecruiterResumeList,
    navigate,
    routeSearch,
    router,
    slug,
  ]);

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
    <RecruiterResumeDetailPage
      backLabel={fromStudioCalendar ? "返回日程管理" : undefined}
      onBack={navigateBackToList}
      onShowAiInterview={showAiInterview}
      onTabChange={changeTab}
      recordId={recordId}
      routeSearch={routeSearch}
    />
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes/$recordId")({
  validateSearch: resumeDetailPageSearchSchema,
  head: () => ({
    meta: [{ title: formatDocumentTitle("候选人详情") }],
  }),
  component: RecruiterResumeDetailRoute,
  pendingComponent: RecruiterResumeDetailSkeleton,
});
