import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import type { statement } from "@arc/shared/permissions";
import { hasPermissionInStatements } from "@arc/shared/permission-statements";
import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";
import { computeWorkspacePermissionSnapshot } from "@app/server/server/access/workspace-permission-snapshot";

export type WorkspaceResource = keyof typeof statement;
export type WorkspaceAction<R extends WorkspaceResource> = (typeof statement)[R][number];

export type WorkspaceAuthorizer = <R extends WorkspaceResource>(input: {
  action: WorkspaceAction<R>;
  resource: R;
}) => Promise<boolean>;

export interface WorkspaceAccessPolicyDependencies {
  computeWorkspacePermissionSnapshot: typeof computeWorkspacePermissionSnapshot;
}

const defaultDependencies: WorkspaceAccessPolicyDependencies = {
  computeWorkspacePermissionSnapshot,
};

/**
 * Bind workspace identity once, then authorize every resource against the same
 * effective permission snapshot used by the UI.
 *
 * Snapshot is computed at most once per authorizer instance (per request).
 * `headers` is accepted for call-site compatibility; authorization no longer
 * goes through Better Auth hasPermission.
 */
export function createRequestWorkspaceAuthorizer(
  {
    memberRole,
    organizationId,
    userId,
  }: {
    headers?: Headers;
    memberRole: string | null | undefined;
    organizationId: string;
    userId: string | null | undefined;
  },
  dependencies: WorkspaceAccessPolicyDependencies = defaultDependencies,
): WorkspaceAuthorizer {
  let statementsPromise: Promise<WorkspacePermissionStatements> | null = null;

  const loadStatements = async (): Promise<WorkspacePermissionStatements> => {
    if (!memberRole || memberRole === NO_ACCESS_WORKSPACE_ROLE || !userId) {
      return {};
    }
    statementsPromise ??= (async () => {
      const snapshot = await dependencies.computeWorkspacePermissionSnapshot({
        memberRole,
        organizationId,
        userId,
      });
      return snapshot.statements;
    })();
    return await statementsPromise;
  };

  return async ({ action, resource }) => {
    if (!memberRole || memberRole === NO_ACCESS_WORKSPACE_ROLE || !userId) {
      return false;
    }
    const statements = await loadStatements();
    return hasPermissionInStatements(statements, resource, action);
  };
}
