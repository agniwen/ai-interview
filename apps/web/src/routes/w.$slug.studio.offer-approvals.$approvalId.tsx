import { createFileRoute } from "@tanstack/react-router";
import { OfferApprovalDetailPage } from "@/components/features/offer-approval/detail-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

export const Route = createFileRoute("/w/$slug/studio/offer-approvals/$approvalId")({
  head: () => ({ meta: [{ title: formatDocumentTitle("Offer 审批详情") }] }),
  component: () => {
    const { approvalId, slug } = Route.useParams();
    return <OfferApprovalDetailPage approvalId={approvalId} slug={slug} />;
  },
});
