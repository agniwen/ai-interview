import { NO_ACCESS_WORKSPACE_ROLE } from "@app/shared/permissions";
import type { ActiveOrganizationState } from "@/lib/start/auth-session-types";

export type HomeGotoTarget = "agent" | "chat" | "studio";

export function resolveHomeRedirect(
  state: ActiveOrganizationState,
  goto?: HomeGotoTarget,
): string | null {
  if (state.status === "unauthenticated") {
    return null;
  }

  if (state.status === "no_active_workspace") {
    return "/select-workspace";
  }

  if (state.member.role === NO_ACCESS_WORKSPACE_ROLE) {
    return "/wait";
  }

  if (goto === "agent" || goto === "chat") {
    return `/w/${state.workspace.slug}/agent`;
  }

  return `/w/${state.workspace.slug}/studio/resumes`;
}
