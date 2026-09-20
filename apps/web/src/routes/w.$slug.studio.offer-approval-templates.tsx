import { createFileRoute, notFound, useParams } from "@tanstack/react-router";
import { OfferApprovalTemplatePage } from "@/components/features/offer-approval/template-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { useHasPermission } from "@/hooks/use-has-permission";

function OfferApprovalTemplateRoute() {
  const canManage = useHasPermission("offerApproval", "manage");
  const { slug } = useParams({ from: "/w/$slug/studio/offer-approval-templates" });
  if (!canManage) {
    throw notFound();
  }
  return <OfferApprovalTemplatePage slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/offer-approval-templates")({
  component: OfferApprovalTemplateRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("审批流配置") }] }),
});
