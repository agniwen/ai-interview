import { createFileRoute, useParams } from "@tanstack/react-router";
import { OfferApprovalTemplateEditorPage } from "@/components/features/offer-approval/template-editor-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
function TemplateEditor() {
  const { slug } = useParams({ from: "/w/$slug/studio/offer-approval-templates/new" });
  return <OfferApprovalTemplateEditorPage key="new" slug={slug} templateId={null} />;
}

export const Route = createFileRoute("/w/$slug/studio/offer-approval-templates/new")({
  component: TemplateEditor,
  head: () => ({ meta: [{ title: formatDocumentTitle("新建审批模板") }] }),
});
