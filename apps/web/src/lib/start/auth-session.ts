import { createServerFn } from "@tanstack/react-start";
import type {
  ActiveOrganizationState,
  NoAccessWaitState,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import {
  getActiveOrganizationStateFromRequest,
  getNoAccessWaitStateFromRequest,
  getWorkspaceSelectionStateFromRequest,
  resolveFirstAllowedStudioPagePath,
  resolveWorkspaceAccessFromRequest,
} from "./auth-session.server";
import { STUDIO_PAGE_PATHS } from "./studio-page-paths";

export const getActiveOrganizationState = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActiveOrganizationState> => await getActiveOrganizationStateFromRequest(),
);

export const getWorkspaceSelectionState = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceSelectionState> => await getWorkspaceSelectionStateFromRequest(),
);

export const getNoAccessWaitState = createServerFn({ method: "GET" }).handler(
  async (): Promise<NoAccessWaitState> => await getNoAccessWaitStateFromRequest(),
);

export const getWorkspaceAccessState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(
    async ({ data }): Promise<WorkspaceAccessState> =>
      await resolveWorkspaceAccessFromRequest(data.slug),
  );

export const getFirstAllowedStudioPagePath = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(
    async ({ data }): Promise<string | null> =>
      await resolveFirstAllowedStudioPagePath(data.slug, STUDIO_PAGE_PATHS),
  );
