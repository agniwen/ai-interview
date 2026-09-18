import { Outlet, createFileRoute } from "@tanstack/react-router";
import { formatDocumentTitle } from "@/lib/start/document-title";

export const Route = createFileRoute("/w/$slug/studio/offer-approvals")({
  head: () => ({ meta: [{ title: formatDocumentTitle("Offer 审批") }] }),
  component: Outlet,
});
