import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import {
  ResumePoolDetailPage,
  ResumePoolDetailPageSkeleton,
} from "@/components/features/studio/resume-pool/resume-pool-detail-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

const resumePoolListLocationStateSchema = z.object({
  fromResumePoolList: z.literal(true).optional(),
});

function ResumePoolDetailRoute() {
  const navigate = useNavigate({ from: "/w/$slug/studio/resume-pool/$recordId" });
  const { recordId, slug } = useParams({ from: "/w/$slug/studio/resume-pool/$recordId" });
  const router = useRouter();

  const navigateBackToList = useCallback(() => {
    const locationState = resumePoolListLocationStateSchema.safeParse(router.state.location.state);
    if (locationState.data?.fromResumePoolList && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      to: "/w/$slug/studio/resume-pool",
    });
  }, [navigate, router, slug]);

  return <ResumePoolDetailPage onBack={navigateBackToList} recordId={recordId} />;
}

export const Route = createFileRoute("/w/$slug/studio/resume-pool/$recordId")({
  head: () => ({
    meta: [{ title: formatDocumentTitle("人才详情") }],
  }),
  component: ResumePoolDetailRoute,
  pendingComponent: ResumePoolDetailPageSkeleton,
});
