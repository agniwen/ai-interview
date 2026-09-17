import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";
import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpReadContext } from "./application/read-recruiting";
import type { McpScope } from "./config";
import type { createRequestWorkspaceAuthorizer } from "../../access/workspace-access-policy";
import type { resolveRecruitingVisibilityScope } from "../../access/recruiting-visibility";
import { isNoAccessWorkspaceRole } from "../../access/workspace-roles";
import { factory } from "../../factory";
import {
  assertActiveMcpGrant,
  mcpClaimsSchema,
  McpAccessError,
  permittedMcpScopes,
} from "./access";
import { getMcpResource, isMcpEnabled, MCP_SCOPES } from "./config";
import type { loadMcpClient, loadMcpGrant, loadMcpMember } from "./dao";

export interface McpRouteDependencies {
  auth: Parameters<typeof requireMcpAuth>[0];
  baseURL: string;
  loadMcpClient: typeof loadMcpClient;
  loadMcpGrant: typeof loadMcpGrant;
  loadMcpMember: typeof loadMcpMember;
  createRequestWorkspaceAuthorizer: typeof createRequestWorkspaceAuthorizer;
  resolveRecruitingVisibilityScope: typeof resolveRecruitingVisibilityScope;
  createServer: (context: McpReadContext, scopes: readonly McpScope[]) => McpServer;
}
export function createMcpRouter(dependencies: McpRouteDependencies) {
  const {
    auth,
    baseURL,
    loadMcpClient,
    loadMcpGrant,
    loadMcpMember,
    createRequestWorkspaceAuthorizer,
    resolveRecruitingVisibilityScope,
    createServer,
  } = dependencies;
  function accessFailure(message: string, status: 401 | 403 | 404) {
    const challenge =
      status === 401
        ? createResourceServerChallenge(
            new APIError("UNAUTHORIZED", { message }),
            getMcpResource(baseURL),
            { challengeScopes: [...MCP_SCOPES] },
          )
        : undefined;
    return Response.json({ message }, { headers: challenge?.headers, status });
  }

  const protectedRequest = requireMcpAuth(
    auth,
    async (request, rawClaims) => {
      const parsed = mcpClaimsSchema.safeParse(rawClaims);
      if (!parsed.success) {
        return accessFailure("需要工作空间授权。", 401);
      }
      const claims = parsed.data;
      try {
        const grant = assertActiveMcpGrant(claims, await loadMcpGrant(claims.mcp_grant_id));
        const [membership, client] = await Promise.all([
          loadMcpMember(claims.sub, grant.organizationId),
          loadMcpClient(claims.client_id),
        ]);
        if (
          !membership ||
          membership.banned ||
          !client ||
          client.disabled ||
          isNoAccessWorkspaceRole(membership.role)
        ) {
          throw new McpAccessError("当前账号或客户端没有访问权限。");
        }
        const authorize = createRequestWorkspaceAuthorizer({
          memberRole: membership.role,
          organizationId: grant.organizationId,
          userId: claims.sub,
        });
        const permitted = await permittedMcpScopes(authorize);
        const tokenScopes = new Set(claims.scope.split(" "));
        const scopes = permitted.filter(
          (scope) => tokenScopes.has(scope) && grant.scopes.includes(scope),
        );
        if (scopes.length === 0) {
          throw new McpAccessError("当前没有可用的读取权限。");
        }
        const visibility = await resolveRecruitingVisibilityScope({
          currentRole: membership.role,
          organizationId: grant.organizationId,
          userId: claims.sub,
        });
        const context = {
          authorize,
          organizationId: grant.organizationId,
          visibility,
        };
        // The official SDK supplies both current and 2025 stateless HTTP compatibility.
        return createMcpHandler(() => createServer(context, scopes), {
          legacy: "stateless",
        }).fetch(request);
      } catch (error) {
        if (error instanceof McpAccessError) {
          return accessFailure(error.message, error.status);
        }
        throw error;
      }
    },
    { challengeScopes: [...MCP_SCOPES], resource: getMcpResource(baseURL) },
  );

  return factory
    .createApp()
    .use(async (c, next) => {
      c.header("Cache-Control", "no-store");
      if (!isMcpEnabled()) {
        return c.json({ message: "MCP 尚未启用。" }, 404);
      }
      await next();
    })
    .post("/", (c) => protectedRequest(c.req.raw))
    .all("/", (c) => {
      c.header("Allow", "POST");
      return c.json({ message: "Method Not Allowed" }, 405);
    });
}
