import type { statement } from "@arc/shared/permissions";
import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";

export type ActiveOrganizationState =
  | { status: "unauthenticated" }
  | { status: "no_active_workspace" }
  | {
      member: {
        role: string;
      };
      status: "ready";
      workspace: {
        id: string;
        slug: string;
      };
    };

export type StudioPageAccessState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | (Extract<WorkspaceAccessState, { status: "ready" }> & {
      allowed: boolean;
    });

export type StudioPagePermissionAction = (typeof statement)["page"][number];

export type WorkspaceSelectionState =
  | { status: "unauthenticated" }
  | {
      organizations: {
        id: string;
        logo: string | null;
        name: string;
        role: string;
        slug: string;
      }[];
      status: "ready";
      user: {
        email: string;
        image: string | null | undefined;
        name: string | null | undefined;
      };
    };

export type NoAccessWaitState =
  | { status: "unauthenticated" }
  | { status: "not_waiting" }
  | {
      status: "waiting";
      workspace: {
        id: string;
        logo: string | null;
        name: string;
        slug: string;
      };
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
      member: {
        role: string;
      };
      /** Effective permission matrix for this user in this workspace (computed once). */
      permissions: WorkspacePermissionStatements;
      status: "ready";
      user: {
        id: string;
      };
      workspace: {
        id: string;
        slug: string;
      };
    };
