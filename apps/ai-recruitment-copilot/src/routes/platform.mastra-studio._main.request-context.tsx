import { createFileRoute } from "@tanstack/react-router";
import RequestContext from "@/components/features/mastra-studio/upstream/pages/request-context";
import { navHandle } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/request-context")({
  component: RequestContext,
  staticData: { handle: navHandle("/request-context") },
});
