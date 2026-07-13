import { createFileRoute } from "@tanstack/react-router";

import { MailIngestLogPage } from "@/components/features/studio/mail-ingest/mail-ingest-log-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";

export const Route = createFileRoute("/w/$slug/studio/mail-ingest-accounts/$id")({
  component: MailIngestLogPage,
  head: () => ({ meta: [{ title: "入库记录" }] }),
  pendingComponent: () => <StudioTablePageSkeleton filterCount={4} label="入库记录" />,
});
