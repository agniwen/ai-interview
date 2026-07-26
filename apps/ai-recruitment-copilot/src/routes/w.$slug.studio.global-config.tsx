import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { GlobalConfigForm } from "@/components/features/studio/global-config/global-config-form";
import { GlobalConfigPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioGlobalConfigState } from "@/lib/start/studio/global-config.functions";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";

function StudioGlobalConfigRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/global-config" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <GlobalConfigForm initial={state.initial} />
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/global-config")({
  loader: async ({ params }) => {
    await requireStudioPageAccess({
      action: "globalConfig",
      pathname: `/w/${params.slug}/studio/global-config`,
      slug: params.slug,
    });
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
  head: () => ({
    meta: [{ title: formatDocumentTitle("上下文设置") }],
  }),
  component: StudioGlobalConfigRoute,
  pendingComponent: GlobalConfigPageSkeleton,
});
