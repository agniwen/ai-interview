import { z } from "zod";
import type { WorkspaceAuthorizer } from "../../access/workspace-access-policy";
import { MCP_SCOPES } from "./config";
import type { McpScope } from "./config";

export class McpAccessError extends Error {
  readonly status: 401 | 403 | 404;
  constructor(message: string, status: 401 | 403 | 404 = 403) {
    super(message);
    this.status = status;
    this.name = "McpAccessError";
  }
}

export const mcpClaimsSchema = z.object({
  client_id: z.string().min(1),
  mcp_grant_id: z.string().min(1),
  scope: z.string(),
  sub: z.string().min(1),
  workspace_id: z.string().min(1),
});

export async function permittedMcpScopes(authorize: WorkspaceAuthorizer): Promise<McpScope[]> {
  const [jobs, candidates, reports] = await Promise.all([
    authorize({ action: "read", resource: "jd" }),
    authorize({ action: "read", resource: "resumeLibrary" }),
    authorize({ action: "read", resource: "interview" }),
  ]);
  return MCP_SCOPES.filter((scope) => {
    if (scope === "jobs:read") {
      return jobs;
    }
    if (scope === "candidates:read") {
      return candidates;
    }
    return reports;
  });
}

export function assertActiveMcpGrant(
  claims: z.infer<typeof mcpClaimsSchema>,
  grant: {
    id: string;
    userId: string;
    clientId: string;
    organizationId: string;
    revokedAt: Date | null;
    scopes: string[];
  } | null,
) {
  if (
    !grant ||
    grant.revokedAt ||
    grant.id !== claims.mcp_grant_id ||
    grant.userId !== claims.sub ||
    grant.clientId !== claims.client_id ||
    grant.organizationId !== claims.workspace_id
  ) {
    throw new McpAccessError("授权已失效，请重新连接并授权。", 401);
  }
  if (
    !claims.scope
      .split(" ")
      .filter(Boolean)
      .every((scope) => scope === "offline_access" || grant.scopes.includes(scope))
  ) {
    throw new McpAccessError("令牌超出已授权范围。", 401);
  }
  return grant;
}
