import { createFileRoute } from "@tanstack/react-router";
import { OfferApprovalsPage } from "@/components/features/offer-approval/page";

export const Route = createFileRoute("/w/$slug/studio/offer-approvals/")({
  component: () => <OfferApprovalsPage slug={Route.useParams().slug} />,
});
