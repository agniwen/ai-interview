import { createFileRoute, useParams } from "@tanstack/react-router";
import { ExternalApplicationPage } from "@/components/features/external-applications/application-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

function ApplicationRoute() {
  const { token } = useParams({ from: "/apply/$token" });
  return <ExternalApplicationPage key={token} token={token} />;
}

export const Route = createFileRoute("/apply/$token")({
  component: ApplicationRoute,
  head: () => ({
    meta: [
      { title: formatDocumentTitle("投递简历") },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});
