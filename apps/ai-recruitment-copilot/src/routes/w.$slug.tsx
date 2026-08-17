import { Outlet, createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { AppVersionProvider } from "@/components/features/app-version/app-version-provider";
import { AppSidebarShell } from "@/components/layout/app-sidebar/app-sidebar-shell";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";

interface WorkspaceRouteDependencies {
  getWorkspaceAccessState: (input: {
    data: { slug: string };
  }) => Promise<Awaited<ReturnType<typeof getWorkspaceAccessState>>>;
}

const defaultWorkspaceRouteDependencies: WorkspaceRouteDependencies = { getWorkspaceAccessState };

export async function loadWorkspaceRoute(
  { location, params }: { location: { href: string; pathname: string }; params: { slug: string } },
  dependencies: WorkspaceRouteDependencies = defaultWorkspaceRouteDependencies,
) {
  const state = await dependencies.getWorkspaceAccessState({ data: { slug: params.slug } });

  if (state.status === "unauthenticated") {
    throw redirect({ href: `/login?callbackURL=${encodeURIComponent(location.href)}` });
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
}

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
        permissions={state.permissions}
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
  loader: loadWorkspaceRoute,
});
