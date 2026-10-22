import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { MailIngestLogPage } from "@/components/features/platform/mail-ingest-accounts/mail-ingest-log-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

const platformMailIngestLogSearchSchema = z.object({
  organizationId: z.string().default(""),
});

function PlatformMailIngestLogRoute() {
  const { id } = useParams({ from: "/platform/mail-ingest-accounts_/$id" });
  const { organizationId } = useSearch({ from: "/platform/mail-ingest-accounts_/$id" });
  return (
    <div className="container mx-auto">
      <MailIngestLogPage accountId={id} organizationId={organizationId} />
    </div>
  );
}

export const Route = createFileRoute("/platform/mail-ingest-accounts_/$id")({
  component: PlatformMailIngestLogRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("平台 · 入库记录") }] }),
  validateSearch: platformMailIngestLogSearchSchema,
});
