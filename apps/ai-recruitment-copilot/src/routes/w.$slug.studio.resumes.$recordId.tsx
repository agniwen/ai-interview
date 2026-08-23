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
  listSearchFromDetailSearch,
  resumeDetailPageSearchSchema,
} from "@/components/features/studio/resumes/recruiter-resume-detail-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

const recruiterResumeListLocationStateSchema = z.object({
  fromRecruiterResumeList: z.literal(true).optional(),
});

function RecruiterResumeDetailRoute() {
  const navigate = useNavigate({ from: "/w/$slug/studio/resumes/$recordId" });
  const { recordId, slug } = useParams({ from: "/w/$slug/studio/resumes/$recordId" });
  const router = useRouter();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes/$recordId" });

  const navigateBackToList = useCallback(() => {
    const locationState = recruiterResumeListLocationStateSchema.safeParse(
      router.state.location.state,
    );
    if (locationState.data?.fromRecruiterResumeList && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      search: listSearchFromDetailSearch(routeSearch),
      to: "/w/$slug/studio/resumes",
    });
  }, [navigate, routeSearch, router, slug]);

  return (
    <RecruiterResumeDetailPage
      onBack={navigateBackToList}
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
