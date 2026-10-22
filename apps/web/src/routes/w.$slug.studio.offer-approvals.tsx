import { Outlet, createFileRoute } from "@tanstack/react-router";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/offer-approvals")({
  loader: ({ parentMatchPromise }) =>
    requireStudioPagePermission(parentMatchPromise, "offerApprovals"),
  head: () => ({ meta: [{ title: formatDocumentTitle("Offer 审批") }] }),
  component: Outlet,
});
