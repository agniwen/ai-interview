import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function LegacyStudioResumesRoute() {
  return null;
}

export const Route = createFileRoute("/studio/resumes")({
  component: LegacyStudioResumesRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/studio/resumes",
      getDestination: (slug) => `/w/${slug}/studio/resumes`,
    }),
});
