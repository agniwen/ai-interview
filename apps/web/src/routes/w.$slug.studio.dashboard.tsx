import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/dashboard")({
  loader: async ({ params, parentMatchPromise }) => {
    await requireStudioPagePermission(parentMatchPromise, "dashboard");
    throw redirect({
      params: { slug: params.slug },
      replace: true,
      search: { view: "dashboard" },
      to: "/w/$slug/studio/recruiting-ledger",
    });
  },
});
