import { createServerFn } from "@tanstack/react-start";

export type ActiveOrganizationState =
  | { status: "unauthenticated" }
  | { status: "no_active_workspace" }
  | {
      status: "ready";
      workspace: {
        id: string;
        slug: string;
      };
    };

export type WorkspaceSelectionState =
  | { status: "unauthenticated" }
  | {
      organizations: {
        id: string;
        logo: string | null;
        name: string;
        slug: string;
      }[];
      status: "ready";
      user: {
        email: string;
        image: string | null | undefined;
        name: string | null | undefined;
      };
    };

export type WorkspaceAccessState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      status: "ready";
      workspace: {
        id: string;
        slug: string;
      };
    };

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
  .validator((input: { slug: string }) => input)
  .handler(async ({ data }): Promise<WorkspaceAccessState> => {
    const sessionApi = await import("./auth-session.server");
    return await sessionApi.resolveWorkspaceAccessFromRequest(data.slug);
  });
