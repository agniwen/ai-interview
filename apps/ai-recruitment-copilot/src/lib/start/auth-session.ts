import { createServerFn } from "@tanstack/react-start";
import type {
  ActiveOrganizationState,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import {
  getActiveOrganizationStateFromRequest,
  getWorkspaceSelectionStateFromRequest,
  resolveWorkspaceAccessFromRequest,
} from "./auth-session.server";

export const getActiveOrganizationState = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveOrganizationState> => await getActiveOrganizationStateFromRequest(),
);

export const getWorkspaceSelectionState = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceSelectionState> => await getWorkspaceSelectionStateFromRequest(),
);

export const getWorkspaceAccessState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(
    async ({ data }): Promise<WorkspaceAccessState> =>
      await resolveWorkspaceAccessFromRequest(data.slug),
  );
