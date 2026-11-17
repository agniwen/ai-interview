import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import {
  ResumePoolDetailPage,
  ResumePoolDetailPageSkeleton,
} from "@/components/features/studio/resume-pool/resume-pool-detail-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { formatDocumentTitle } from "@/lib/start/document-title";

const OVERLAY_ROUTE = "/w/$slug/studio/external-applications/overlay/$recordId" as const;

const listLocationStateSchema = z.object({ fromResumePoolList: z.literal(true) });

function ResumePoolDetailOverlayRoute() {
  const navigate = useNavigate({ from: OVERLAY_ROUTE });
  const { recordId, slug } = useParams({ from: OVERLAY_ROUTE });
  const router = useRouter();

  const navigateBackToList = useCallback(() => {
    const fromList = listLocationStateSchema.safeParse(router.state.location.state).success;
    if (fromList && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      to: "/w/$slug/studio/external-applications",
    });
  }, [navigate, router, slug]);

  return (
    <StudioContentRouteOverlay>
      <ResumePoolDetailPage externalOnly onBack={navigateBackToList} recordId={recordId} />
    </StudioContentRouteOverlay>
  );
}

function ResumePoolDetailOverlayPending() {
  return (
    <StudioContentRouteOverlay>
      <ResumePoolDetailPageSkeleton />
    </StudioContentRouteOverlay>
  );
}

export const Route = createFileRoute("/w/$slug/studio/external-applications/overlay/$recordId")({
  head: () => ({
    meta: [{ title: formatDocumentTitle("人才详情") }],
  }),
  component: ResumePoolDetailOverlayRoute,
  pendingComponent: ResumePoolDetailOverlayPending,
});
