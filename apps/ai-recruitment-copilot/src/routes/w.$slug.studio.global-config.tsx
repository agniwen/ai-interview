import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { GlobalConfigForm } from "@/components/studio/global-config/global-config-form";
import { loadStudioGlobalConfigState } from "@/lib/start/studio/global-config.functions";

function StudioGlobalConfigRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/global-config" });

  if (state.status !== "ready") {
    return null;
  }

  return <GlobalConfigForm initial={state.initial} />;
}

export const Route = createFileRoute("/w/$slug/studio/global-config")({
  component: StudioGlobalConfigRoute,
  head: () => ({
    meta: [{ title: "系统设置" }],
  }),
  loader: async ({ params }) => {
    const state = await loadStudioGlobalConfigState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/global-config`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
});
