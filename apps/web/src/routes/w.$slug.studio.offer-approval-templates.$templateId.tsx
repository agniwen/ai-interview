import { createFileRoute, useParams } from "@tanstack/react-router";
import { OfferApprovalTemplateEditorPage } from "@/components/features/offer-approval/template-editor-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
function TemplateEditor() {
  const { slug, templateId } = useParams({
    from: "/w/$slug/studio/offer-approval-templates/$templateId",
  });
  return <OfferApprovalTemplateEditorPage key={templateId} slug={slug} templateId={templateId} />;
}

export const Route = createFileRoute("/w/$slug/studio/offer-approval-templates/$templateId")({
  component: TemplateEditor,
  head: () => ({ meta: [{ title: formatDocumentTitle("编辑审批模板") }] }),
});
