import { createServerFn } from "@tanstack/react-start";
import type {
  ActiveOrganizationState,
  NoAccessWaitState,
  StudioPageAccessState,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import {
  getActiveOrganizationStateFromRequest,
  getNoAccessWaitStateFromRequest,
  getWorkspaceSelectionStateFromRequest,
  resolveFirstAllowedStudioPagePath,
  resolveStudioPageAccessFromRequest,
  resolveWorkspaceAccessFromRequest,
} from "./auth-session.server";
import { STUDIO_PAGE_PATHS } from "./studio-page-paths";
import { STUDIO_PAGE_PERMISSION_ACTIONS } from "@arc/shared/permissions";
import { z } from "zod";

const studioPageAccessInputSchema = slugInputSchema.extend({
  action: z.enum(STUDIO_PAGE_PERMISSION_ACTIONS),
});

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

export const getStudioPageAccessState = createServerFn({ method: "GET" })
  .validator(studioPageAccessInputSchema)
  .handler(
    async ({ data }): Promise<StudioPageAccessState> =>
      await resolveStudioPageAccessFromRequest(data.slug, data.action),
  );

export const getFirstAllowedStudioPagePath = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(
    async ({ data }): Promise<string | null> =>
      await resolveFirstAllowedStudioPagePath(data.slug, STUDIO_PAGE_PATHS),
  );
