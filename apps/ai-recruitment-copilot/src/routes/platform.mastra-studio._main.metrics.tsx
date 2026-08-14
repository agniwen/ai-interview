import { createFileRoute } from "@tanstack/react-router";
import Metrics from "@/components/features/mastra-studio/upstream/pages/metrics";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/metrics")({
  component: Metrics,
  staticData: { handle: navHandle("/metrics") },
});
