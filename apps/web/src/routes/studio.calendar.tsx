import { createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function LegacyStudioCalendarRoute() {
  return null;
}

export const Route = createFileRoute("/studio/calendar")({
  component: LegacyStudioCalendarRoute,
  loader: async () =>
    await redirectToActiveWorkspace({
      callbackPath: "/studio/calendar",
      getDestination: (slug) => `/w/${slug}/studio/calendar`,
    }),
});
