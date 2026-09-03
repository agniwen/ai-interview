import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function LegacyStudioInterviewsRoute() {
  return null;
}

export const Route = createFileRoute("/studio/interviews")({
  component: LegacyStudioInterviewsRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/studio/interviews",
      getDestination: (slug) => `/w/${slug}/studio/interviews`,
    }),
});
