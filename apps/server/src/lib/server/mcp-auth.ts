import { mcp } from "@better-auth/mcp";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { getMcpAuthorizationContext } from "../../server/routes/mcp/authorization-context";
import { getMcpResource, MCP_SCOPES } from "../../server/routes/mcp/config";
import type * as mcpStore from "../../server/routes/mcp/dao";
import { isNoAccessWorkspaceRole } from "../../server/access/workspace-roles";

export function createMcpAuthPlugins(
  baseURL: string,
  dependencies: {
    loadMcpGrant: typeof mcpStore.loadMcpGrant;
    loadMcpMember: typeof mcpStore.loadMcpMember;
  },
) {
  const { loadMcpGrant, loadMcpMember } = dependencies;
  return [
    jwt(),
    mcp({
      accessTokenExpiresIn: 600,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      consentPage: "/mcp/authorize",
      customAccessTokenClaims: async ({ user: actor, referenceId }) => {
        const grant = referenceId ? await loadMcpGrant(referenceId) : null;
        if (!actor || !grant || grant.revokedAt || grant.userId !== actor.id) {
          throw new APIError("FORBIDDEN", { message: "工作空间授权已失效。" });
        }
        const membership = await loadMcpMember(actor.id, grant.organizationId);
        if (!membership || membership.banned || isNoAccessWorkspaceRole(membership.role)) {
          throw new APIError("FORBIDDEN", { message: "没有工作空间访问权限。" });
        }
        return { mcp_grant_id: grant.id, workspace_id: grant.organizationId };
      },
      grantTypes: ["authorization_code", "refresh_token"],
      loginPage: "/mcp/authorize",
      postLogin: {
        consentReferenceId: ({ user: actor }) => {
          const context = getMcpAuthorizationContext();
          if (!context || context.userId !== actor.id) {
            throw new APIError("FORBIDDEN", { message: "请先选择并授权工作空间。" });
          }
          return context.grantId;
        },
        page: "/mcp/authorize",
        shouldRedirect: ({ user: actor }) => getMcpAuthorizationContext()?.userId !== actor.id,
      },
      resource: getMcpResource(baseURL),
      scopes: [...MCP_SCOPES, "offline_access"],
    }),
  ] as const;
}
