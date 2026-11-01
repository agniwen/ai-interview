import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

export const Route = createFileRoute("/studio/")({
  loader: async () => {
    await redirectToActiveWorkspace({
      callbackPath: "/studio",
      getDestination: (slug) => `/w/${slug}/studio`,
    });
  },
});
