import { createFileRoute, useParams } from "@tanstack/react-router";
import { OfferApprovalTemplatePage } from "@/components/features/offer-approval/template-page";
function TemplateList() {
  const { slug } = useParams({ from: "/w/$slug/studio/offer-approval-templates/" });
  return <OfferApprovalTemplatePage slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/offer-approval-templates/")({
  component: TemplateList,
});
