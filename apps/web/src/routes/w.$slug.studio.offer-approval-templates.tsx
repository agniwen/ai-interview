import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { useHasPermission } from "@/hooks/use-has-permission";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

function OfferApprovalTemplateRoute() {
  const canManage = useHasPermission("offerApproval", "manage");
  if (!canManage) {
    throw notFound();
  }
  return <Outlet />;
}

export const Route = createFileRoute("/w/$slug/studio/offer-approval-templates")({
  loader: ({ parentMatchPromise }) =>
    requireStudioPagePermission(parentMatchPromise, "offerApprovalTemplates"),
  component: OfferApprovalTemplateRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("审批流配置") }] }),
});
