import { createFileRoute } from "@tanstack/react-router";
import Templates from "@/components/features/mastra-studio/upstream/pages/templates";
import type { RouteHeaderHandle } from "@/components/features/mastra-studio/upstream/lib/route-header";

export const Route = createFileRoute("/platform/mastra-studio/_main/templates")({
  component: Templates,
  staticData: {
    handle: {
      crumbs: [{ id: "templates", label: "Templates" }],
    } satisfies RouteHeaderHandle,
  },
});
