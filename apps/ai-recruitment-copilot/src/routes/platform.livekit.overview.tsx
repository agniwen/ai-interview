import { createFileRoute } from "@tanstack/react-router";
import { LiveKitOverview } from "@/components/features/platform/livekit/livekit-overview";
import { formatDocumentTitle } from "@/lib/start/document-title";

function PlatformLiveKitOverviewRoute() {
  return (
    <div className="container mx-auto">
      <LiveKitOverview />
    </div>
  );
}

export const Route = createFileRoute("/platform/livekit/overview")({
  component: PlatformLiveKitOverviewRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("平台 · LiveKit 服务概览") }] }),
});
