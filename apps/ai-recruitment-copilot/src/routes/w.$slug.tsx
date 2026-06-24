import { useEffect } from "react";
import { Outlet, createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { BackgroundStreamToaster } from "@/components/features/chat/background-stream-toaster";
import { AppSidebarShell } from "@/components/layout/app-sidebar/app-sidebar-shell";
import { authClient } from "@/lib/client/auth-client";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";

function ActiveWorkspaceSync({ workspaceId }: { workspaceId: string }) {
  const {
    data: activeOrganization,
    isPending,
    refetch: refetchActiveOrganization,
  } = authClient.useActiveOrganization();

  useEffect(() => {
    if (isPending || activeOrganization?.id === workspaceId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await authClient.organization.setActive({ organizationId: workspaceId });
      } finally {
        if (!cancelled) {
          await refetchActiveOrganization();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, isPending, refetchActiveOrganization, workspaceId]);

  return null;
}

function WorkspaceRoute() {
  const state = useLoaderData({ from: "/w/$slug" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <WorkspaceSlugProvider
      id={state.workspace.id}
      memberRole={state.member.role}
      slug={state.workspace.slug}
    >
      <ActiveWorkspaceSync workspaceId={state.workspace.id} />
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

    if (state.member.role === NO_ACCESS_WORKSPACE_ROLE) {
      throw redirect({ href: "/wait" });
    }

    if (location.pathname === `/w/${params.slug}`) {
      throw redirect({ href: `/w/${params.slug}/studio/resumes` });
    }

    return state;
  },
});
