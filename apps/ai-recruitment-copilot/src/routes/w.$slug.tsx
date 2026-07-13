import { Outlet, createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { AppVersionProvider } from "@/components/features/app-version/app-version-provider";
import { AppSidebarShell } from "@/components/layout/app-sidebar/app-sidebar-shell";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";

function WorkspaceRoute() {
  const state = useLoaderData({ from: "/w/$slug" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <AppVersionProvider>
      <WorkspaceSlugProvider
        id={state.workspace.id}
        memberRole={state.member.role}
        slug={state.workspace.slug}
      >
        <AppSidebarShell>
          <Outlet />
        </AppSidebarShell>
        <BackgroundStreamToaster />
      </WorkspaceSlugProvider>
    </AppVersionProvider>
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

    if (state.member.role === NO_ACCESS_WORKSPACE_ROLE) {
      throw redirect({ href: "/wait" });
    }

    if (location.pathname === `/w/${params.slug}`) {
      throw redirect({ href: `/w/${params.slug}/studio/resumes` });
    }

    return state;
  },
});
