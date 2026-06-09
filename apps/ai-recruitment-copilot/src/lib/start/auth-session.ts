import { createServerFn } from "@tanstack/react-start";
import type {
  ActiveOrganizationState,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { slugInputSchema } from "@/lib/start/server-fn-validators";

export const getActiveOrganizationState = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveOrganizationState> => {
    const sessionApi = await import("./auth-session.server");
    return await sessionApi.getActiveOrganizationStateFromRequest();
  },
);

export const getWorkspaceSelectionState = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceSelectionState> => {
    const sessionApi = await import("./auth-session.server");
    return await sessionApi.getWorkspaceSelectionStateFromRequest();
  },
);

export const getWorkspaceAccessState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<WorkspaceAccessState> => {
    const sessionApi = await import("./auth-session.server");
    return await sessionApi.resolveWorkspaceAccessFromRequest(data.slug);
  });
