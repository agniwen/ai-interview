import { createFileRoute } from "@tanstack/react-router";
import IntegrationsPage from "@/components/features/mastra-studio/upstream/pages/integrations";
import type { RouteHeaderHandle } from "@/components/features/mastra-studio/upstream/lib/route-header";

export const Route = createFileRoute("/platform/mastra-studio/_main/integrations")({
  component: IntegrationsPage,
  staticData: {
    handle: {
      crumbs: [{ id: "integrations", label: "Integrations" }],
    } satisfies RouteHeaderHandle,
  },
});
