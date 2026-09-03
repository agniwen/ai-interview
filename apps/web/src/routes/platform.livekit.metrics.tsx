import { createFileRoute } from "@tanstack/react-router";
import { LiveKitMetricsGrid } from "@/components/features/platform/livekit/livekit-metrics-grid";
import { formatDocumentTitle } from "@/lib/start/document-title";

function PlatformLiveKitMetricsRoute() {
  return (
    <div className="container mx-auto">
      <LiveKitMetricsGrid />
    </div>
  );
}

export const Route = createFileRoute("/platform/livekit/metrics")({
  component: PlatformLiveKitMetricsRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("平台 · LiveKit 运行指标") }] }),
});
