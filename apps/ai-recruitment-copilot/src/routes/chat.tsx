import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function LegacyChatRoute() {
  return null;
}

export const Route = createFileRoute("/chat")({
  component: LegacyChatRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/chat",
      getDestination: (slug) => `/w/${slug}/chat`,
    }),
});
