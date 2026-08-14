import { createFileRoute } from "@tanstack/react-router";
import { StudioIndexRedirect } from "@/components/features/mastra-studio/upstream/lib/studio-index-redirect";
import type { RouteHeaderHandle } from "@/components/features/mastra-studio/upstream/lib/route-header";

export const Route = createFileRoute("/platform/mastra-studio/_main/")({
  component: StudioIndexRedirect,
  staticData: {
    handle: {
      crumbs: [{ id: "home", label: "Home" }],
    } satisfies RouteHeaderHandle,
  },
});
