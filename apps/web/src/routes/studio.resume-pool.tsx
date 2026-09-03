import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function LegacyStudioResumePoolRoute() {
  return null;
}

export const Route = createFileRoute("/studio/resume-pool")({
  component: LegacyStudioResumePoolRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/studio/resume-pool",
      getDestination: (slug) => `/w/${slug}/studio/resume-pool`,
    }),
});
