import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/calendar")({
  loader: async ({ parentMatchPromise, params }) => {
    await requireStudioPagePermission(parentMatchPromise, "calendar");
    throw redirect({
      params: { slug: params.slug },
      search: { view: "list" },
      to: "/w/$slug/studio/interviews",
      replace: true,
    });
  },
});
