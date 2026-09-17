import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Auth } from "better-auth";
import type * as dao from "./dao";
import type { createRequestWorkspaceAuthorizer } from "../../access/workspace-access-policy";
import { factory, jsonValidatorError } from "../../factory";
import { McpAccessError, permittedMcpScopes } from "./access";
import { runWithMcpAuthorization } from "./authorization-context";
import { isMcpEnabled, MCP_SCOPES } from "./config";

import { isNoAccessWorkspaceRole } from "../../access/workspace-roles";

const consentInput = z.object({
  accept: z.boolean(),
  oauthQuery: z.string().min(1).max(16_000),
  scopes: z.array(z.enum(MCP_SCOPES)).min(1).optional(),
  workspaceId: z.string().min(1).max(200).optional(),
});
const oauthRedirect = z.object({ redirect: z.boolean().optional(), url: z.string().min(1) });

export interface McpManagementDependencies {
  auth: Pick<Auth, "handler">;
  baseURL: string;
  trustedOrigins: string[];
  createRequestWorkspaceAuthorizer: typeof createRequestWorkspaceAuthorizer;
  store: Pick<
    typeof dao,
    | "createMcpGrant"
    | "listMcpGrants"
    | "listMcpWorkspaces"
    | "loadMcpClient"
    | "loadMcpMember"
    | "revokeMcpGrant"
  >;
}
export function createMcpManagementRouter(dependencies: McpManagementDependencies) {
  const { auth, baseURL, trustedOrigins, createRequestWorkspaceAuthorizer, store } = dependencies;
  const {
    createMcpGrant,
    listMcpGrants,
    listMcpWorkspaces,
    loadMcpClient,
    loadMcpMember,
    revokeMcpGrant,
  } = store;
  function submitConsent(
    headers: Headers,
    body: { accept: boolean; oauth_query: string; scope?: string },
  ) {
    return auth.handler(
      new Request(new URL("/api/auth/oauth2/consent", baseURL), {
        body: JSON.stringify(body),
        headers,
        method: "POST",
      }),
    );
  }

  return factory
    .createApp()
    .use(async (c, next) => {
      if (!isMcpEnabled()) {
        return c.json({ message: "MCP 尚未启用。" }, 404);
      }
      if (!c.var.user) {
        return c.json({ message: "请先登录。" }, 401);
      }
      if (c.req.method !== "GET") {
        const origin = c.req.header("origin");
        const allowed = trustedOrigins.some((entry) => new URL(entry).origin === origin);
        if (!origin || !allowed) {
          return c.json({ message: "请求来源无效。" }, 403);
        }
      }
      c.header("Cache-Control", "no-store");
      await next();
    })
    .get(
      "/context",
      zValidator(
        "query",
        z.object({ clientId: z.string().min(1).max(2048) }),
        jsonValidatorError("客户端参数无效。"),
      ),
      async (c) => {
        const actor = c.var.user;
        if (!actor) {
          return c.json({ message: "请先登录。" }, 401);
        }
        const client = await loadMcpClient(c.req.valid("query").clientId);
        if (!client || client.disabled) {
          return c.json({ message: "客户端不存在或已停用。" }, 404);
        }
        const memberships = await listMcpWorkspaces(actor.id);
        const workspaces = await Promise.all(
          memberships
            .filter((item) => !isNoAccessWorkspaceRole(item.role))
            .map(async (item) => ({
              id: item.id,
              name: item.name,
              scopes: await permittedMcpScopes(
                createRequestWorkspaceAuthorizer({
                  memberRole: item.role,
                  organizationId: item.id,
                  userId: actor.id,
                }),
              ),
            })),
        );
        return c.json(
          {
            client: { id: client.clientId, name: client.name ?? "未命名客户端" },
            workspaces: workspaces.filter((item) => item.scopes.length > 0),
          },
          200,
        );
      },
    )
    .post(
      "/consent",
      zValidator("json", consentInput, jsonValidatorError("授权参数无效。")),
      async (c) => {
        const actor = c.var.user;
        if (!actor) {
          return c.json({ message: "请先登录。" }, 401);
        }
        const input = c.req.valid("json");
        const headers = new Headers(c.req.raw.headers);
        headers.set("accept", "application/json");
        headers.delete("content-length");
        if (!input.accept) {
          const response = await submitConsent(headers, {
            accept: false,
            oauth_query: input.oauthQuery,
          });
          if (!response.ok) {
            return c.json({ message: "授权请求无效，请在客户端重新发起连接。" }, 400);
          }
          return c.json(oauthRedirect.parse(await response.json()), 200);
        }
        const requested = new URLSearchParams(input.oauthQuery);
        const clientId = requested.get("client_id");
        if (!clientId || !input.workspaceId || !input.scopes) {
          return c.json({ message: "请选择工作空间和访问范围。" }, 400);
        }
        const client = await loadMcpClient(clientId);
        const membership = await loadMcpMember(actor.id, input.workspaceId);
        if (
          !client ||
          client.disabled ||
          !membership ||
          membership.banned ||
          isNoAccessWorkspaceRole(membership.role)
        ) {
          return c.json({ message: "没有授权该工作空间的权限。" }, 403);
        }
        const permitted = await permittedMcpScopes(
          createRequestWorkspaceAuthorizer({
            memberRole: membership.role,
            organizationId: input.workspaceId,
            userId: actor.id,
          }),
        );
        const requestedScopes = new Set((requested.get("scope") ?? "").split(" "));
        if (
          !input.scopes.every((scope) => permitted.includes(scope) && requestedScopes.has(scope))
        ) {
          return c.json({ message: "选择的访问范围不可授权。" }, 403);
        }
        const scopes = [...new Set(input.scopes)];
        const grantId = crypto.randomUUID();
        await createMcpGrant({
          clientId,
          id: grantId,
          organizationId: input.workspaceId,
          scopes,
          userId: actor.id,
        });
        try {
          // Better Auth verifies the signed OAuth query and PKCE request. The request-local
          // reference binds consent/code/refresh tokens to this exact workspace grant.
          const response = await runWithMcpAuthorization({ grantId, userId: actor.id }, () =>
            submitConsent(headers, {
              accept: true,
              oauth_query: input.oauthQuery,
              scope: [
                ...scopes,
                ...(requestedScopes.has("offline_access") ? ["offline_access"] : []),
              ].join(" "),
            }),
          );
          if (!response.ok) {
            await revokeMcpGrant(grantId, actor.id);
            return c.json({ message: "授权请求无效，请在客户端重新发起连接。" }, 400);
          }
          const redirect = oauthRedirect.parse(await response.json());
          const destination = new URL(redirect.url, c.req.url);
          if (!destination.searchParams.has("code")) {
            await revokeMcpGrant(grantId, actor.id);
            return c.json({ message: "登录或授权请求已失效，请在客户端重新发起连接。" }, 400);
          }
          return c.json(redirect, 200);
        } catch (error) {
          await revokeMcpGrant(grantId, actor.id);
          if (error instanceof McpAccessError) {
            return c.json({ message: error.message }, error.status);
          }
          throw error;
        }
      },
    )
    .get("/grants", async (c) => {
      const actor = c.var.user;
      if (!actor) {
        return c.json({ message: "请先登录。" }, 401);
      }
      const grants = await listMcpGrants(actor.id);
      return c.json(
        { grants: grants.map((grant) => ({ ...grant, createdAt: grant.createdAt.toISOString() })) },
        200,
      );
    })
    .delete("/grants/:id", async (c) => {
      const actor = c.var.user;
      if (!actor) {
        return c.json({ message: "请先登录。" }, 401);
      }
      if (!(await revokeMcpGrant(c.req.param("id"), actor.id))) {
        return c.json({ message: "授权不存在。" }, 404);
      }
      return c.json({ success: true }, 200);
    });
}
