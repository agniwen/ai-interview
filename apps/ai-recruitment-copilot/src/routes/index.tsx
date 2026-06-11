import { createFileRoute, redirect } from "@tanstack/react-router";
import { getActiveOrganizationState } from "@/lib/start/auth-session";
import HomeShell from "@/components/features/home/home-shell";

type GotoTarget = "chat" | "studio";

interface HomeSearch {
  goto?: GotoTarget;
}

function resolveGoto(value: unknown): GotoTarget | undefined {
  return value === "chat" || value === "studio" ? value : undefined;
}

function buildWorkspaceDestination(slug: string, goto: GotoTarget | undefined): string {
  if (goto === "chat") {
    return `/w/${slug}/chat`;
  }
  return `/w/${slug}/studio/resumes`;
}

function HomeRoute() {
  return <HomeShell />;
}

export const Route = createFileRoute("/")({
  component: HomeRoute,
  loader: async (loaderContext) => {
    const { deps } = loaderContext as { deps: HomeSearch };
    const state = await getActiveOrganizationState();
    if (state.status === "unauthenticated") {
      return null;
    }

    if (state.status === "no_active_workspace") {
      throw redirect({ href: "/select-workspace" });
    }

    throw redirect({
      href: buildWorkspaceDestination(state.workspace.slug, deps.goto),
    });
  },
  loaderDeps: ({ search }) => ({ goto: (search as HomeSearch).goto }),
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    goto: resolveGoto(search.goto),
  }),
});
