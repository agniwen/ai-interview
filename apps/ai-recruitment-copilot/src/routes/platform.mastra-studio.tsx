import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioRouteSkeleton } from "@/components/features/mastra-studio/router/mastra-studio-route-skeleton";
import { MastraStudioRouteRoot } from "@/components/features/mastra-studio/router/studio-route-root";

export const Route = createFileRoute("/platform/mastra-studio")({
  component: MastraStudioRouteRoot,
  head: () => ({ meta: [{ title: "平台 · Mastra Studio" }] }),
  pendingComponent: MastraStudioRouteSkeleton,
  ssr: false,
});
