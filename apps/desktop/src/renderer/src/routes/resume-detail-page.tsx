import { useParams } from "@tanstack/react-router";
import { HomeSidebarSlots } from "@/components/features/home/home-sidebar-slots";
import { ResumeDetailPage } from "@/components/features/studio/resumes/resume-detail-page";
import { StudioContentRouteOverlay } from "@/components/features/studio/studio-content-route-overlay";

export function ResumeDetailRoutePage() {
  const { recordId } = useParams({ from: "/_app/resumes/$recordId" });
  return (
    <>
      <HomeSidebarSlots />
      <ResumeDetailPage recordId={recordId} />
    </>
  );
}

export function ResumeDetailOverlayRoutePage() {
  const { recordId } = useParams({ from: "/_app/recruitment/overlay/$recordId" });
  return (
    <StudioContentRouteOverlay>
      <ResumeDetailPage recordId={recordId} />
    </StudioContentRouteOverlay>
  );
}
