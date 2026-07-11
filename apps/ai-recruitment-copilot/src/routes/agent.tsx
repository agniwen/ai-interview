import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function AgentRoute() {
  return null;
}

export const Route = createFileRoute("/agent")({
  component: AgentRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/agent",
      getDestination: (slug) => `/w/${slug}/agent`,
    }),
});
