import { Outlet, createFileRoute } from "@tanstack/react-router";
import { redirectToActiveWorkspace } from "@/lib/start/workspace-redirect";

function StudioRoute() {
  return <Outlet />;
}

export const Route = createFileRoute("/studio")({
  component: StudioRoute,
  loader: async (loaderContext) => {
    const { location } = loaderContext as { location: { pathname: string } };
    if (location.pathname !== "/studio") {
      return null;
    }

    await redirectToActiveWorkspace({
      callbackPath: "/studio",
      getDestination: (slug) => `/w/${slug}/studio`,
    });
  },
});
