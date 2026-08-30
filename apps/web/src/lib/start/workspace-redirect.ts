import { redirect } from "@tanstack/react-router";
import { getActiveOrganizationState } from "@/lib/start/auth-session";

export async function redirectToActiveWorkspace({
  callbackPath,
  getDestination,
}: {
  callbackPath: string;
  getDestination: (slug: string) => string;
}) {
  const state = await getActiveOrganizationState();
  if (state.status === "unauthenticated") {
    throw redirect({
      href: `/login?callbackURL=${encodeURIComponent(callbackPath)}`,
    });
  }

  if (state.status === "no_active_workspace") {
    throw redirect({ href: "/select-workspace" });
  }

  throw redirect({ href: getDestination(state.workspace.slug) });
}
