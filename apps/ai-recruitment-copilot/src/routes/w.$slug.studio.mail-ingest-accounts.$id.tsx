import { createFileRoute } from "@tanstack/react-router";

import { MailIngestLogPage } from "@/components/features/studio/mail-ingest/mail-ingest-log-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";

export const Route = createFileRoute("/w/$slug/studio/mail-ingest-accounts/$id")({
  component: MailIngestLogPage,
  head: () => ({ meta: [{ title: formatDocumentTitle("入库记录") }] }),
  pendingComponent: () => <StudioTablePageSkeleton filterCount={4} label="入库记录" />,
});
