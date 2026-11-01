import { Outlet, createFileRoute } from "@tanstack/react-router";

function StudioRoute() {
  return <Outlet />;
}

export const Route = createFileRoute("/studio")({
  component: StudioRoute,
});
