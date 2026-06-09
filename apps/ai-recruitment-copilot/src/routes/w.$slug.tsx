import { Outlet, createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { BackgroundStreamToaster } from "@/components/chat/background-stream-toaster";
import { AppSidebarShell } from "@/components/layout/app-sidebar/app-sidebar-shell";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";

function WorkspaceRoute() {
  const state = useLoaderData({ from: "/w/$slug" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <WorkspaceSlugProvider slug={state.workspace.slug}>
      <AppSidebarShell>
        <Outlet />
      </AppSidebarShell>
      <BackgroundStreamToaster />
    </WorkspaceSlugProvider>
  );
}

export const Route = createFileRoute("/w/$slug")({
  component: WorkspaceRoute,
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as {
      location: { pathname: string };
      params: { slug: string };
    };
    const state = await getWorkspaceAccessState({ data: { slug: params.slug } });

    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}`)}`,
      });
    }

    if (state.status === "not_found") {
      throw notFound();
    }

    if (location.pathname === `/w/${params.slug}`) {
      throw redirect({ href: `/w/${params.slug}/studio/resumes` });
    }

    return state;
  },
});
