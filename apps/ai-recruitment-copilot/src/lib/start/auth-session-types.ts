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
