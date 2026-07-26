import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioRouteSkeleton } from "@/components/features/mastra-studio/router/mastra-studio-route-skeleton";
import { MastraStudioRouteRoot } from "@/components/features/mastra-studio/router/studio-route-root";
import { documentTitleMeta } from "@/lib/start/document-title";

export const Route = createFileRoute("/platform/mastra-studio")({
  ssr: false,
  head: ({ matches }) => ({ meta: documentTitleMeta(matches) }),
  component: MastraStudioRouteRoot,
  pendingComponent: MastraStudioRouteSkeleton,
});
