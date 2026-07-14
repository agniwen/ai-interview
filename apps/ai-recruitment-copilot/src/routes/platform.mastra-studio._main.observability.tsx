import { createFileRoute } from "@tanstack/react-router";
import Traces from "@/components/features/mastra-studio/upstream/pages/traces";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/observability")({
  component: Traces,
  staticData: { handle: navHandle("/observability") },
});
