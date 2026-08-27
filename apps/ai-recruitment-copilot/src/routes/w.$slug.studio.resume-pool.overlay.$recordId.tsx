import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  ResumePoolDetailPage,
  ResumePoolDetailPageSkeleton,
} from "@/components/features/studio/resume-pool/resume-pool-detail-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";
import { formatDocumentTitle } from "@/lib/start/document-title";

const OVERLAY_ROUTE = "/w/$slug/studio/resume-pool/overlay/$recordId" as const;

function ResumePoolDetailOverlayRoute() {
  const navigate = useNavigate({ from: OVERLAY_ROUTE });
  const { recordId, slug } = useParams({ from: OVERLAY_ROUTE });
  const router = useRouter();

  const navigateBackToList = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      to: "/w/$slug/studio/resume-pool",
    });
  }, [navigate, router, slug]);

  return (
    <StudioContentRouteOverlay onClose={navigateBackToList}>
      {({ requestClose }) => <ResumePoolDetailPage onBack={requestClose} recordId={recordId} />}
    </StudioContentRouteOverlay>
  );
}

function ResumePoolDetailOverlayPending() {
  return (
    <StudioContentRouteOverlay>{() => <ResumePoolDetailPageSkeleton />}</StudioContentRouteOverlay>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resume-pool/overlay/$recordId")({
  head: () => ({
    meta: [{ title: formatDocumentTitle("人才详情") }],
  }),
  component: ResumePoolDetailOverlayRoute,
  pendingComponent: ResumePoolDetailOverlayPending,
});
