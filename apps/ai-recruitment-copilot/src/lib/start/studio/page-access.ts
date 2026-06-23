import { notFound, redirect } from "@tanstack/react-router";
import { getStudioPageAccessState } from "@/lib/start/auth-session";
import type { StudioPagePermissionAction } from "@/lib/start/auth-session-types";

export async function requireStudioPageAccess({
  action,
  pathname,
  slug,
}: {
  action: StudioPagePermissionAction;
  pathname: string;
  slug: string;
}) {
  const state = await getStudioPageAccessState({ data: { action, slug } });
  if (state.status === "unauthenticated") {
    throw redirect({
      href: `/login?callbackURL=${encodeURIComponent(pathname)}`,
    });
  }
  if (state.status === "not_found" || !state.allowed) {
    throw notFound();
  }
}
