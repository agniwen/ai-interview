import { createFileRoute } from "@tanstack/react-router";
import { MastraStudioRouteSkeleton } from "@/components/features/mastra-studio/router/mastra-studio-route-skeleton";
import { MastraStudioRouteRoot } from "@/components/features/mastra-studio/router/studio-route-root";
import { documentTitleMeta } from "@/lib/start/document-title";

export const Route = createFileRoute("/platform/mastra-studio")({
  component: MastraStudioRouteRoot,
  head: ({ matches }) => ({ meta: documentTitleMeta(matches) }),
  pendingComponent: MastraStudioRouteSkeleton,
  ssr: false,
});
