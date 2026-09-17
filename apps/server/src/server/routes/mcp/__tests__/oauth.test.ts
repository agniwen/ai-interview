import { createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../../../type";
import type { mcpGrant } from "@app/db-schema/schema";
import { createMcpAuthPlugins } from "../../../../lib/server/mcp-auth";
import { createMcpManagementRouter } from "../management-route";
import type { McpManagementDependencies } from "../management-route";
import { createMcpRouter } from "../route";
import type { McpRouteDependencies } from "../route";
import { createRecruitingMcpServer } from "../tools";
import type { createRecruitingReader } from "../application/read-recruiting";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const database: Parameters<typeof memoryAdapter>[0] = Object.fromEntries(
  [
    "user",
    "session",
    "account",
    "verification",
    "jwks",
    "oauthClient",
    "oauthResource",
    "oauthClientResource",
    "oauthConsent",
    "oauthRefreshToken",
    "oauthAccessToken",
    "oauthClientAssertion",
  ].map((key) => [key, []]),
);
const fixture = {
  banned: false,
  grants: new Map<string, typeof mcpGrant.$inferSelect>(),
  members: new Set<string>(),
  permitted: true,
};
const store = {
  createMcpGrant: (input: typeof mcpGrant.$inferInsert) => {
    fixture.grants.set(input.id, { ...input, createdAt: new Date(), revokedAt: null });
    return Promise.resolve();
  },
  listMcpGrants: () => Promise.resolve([]),
  listMcpWorkspaces: () => Promise.resolve([{ id: "org-a", name: "测试工作空间", role: "member" }]),
  loadMcpClient: (clientId: string) => {
    const row = database.oauthClient.find((item) => item.clientId === clientId);
    return Promise.resolve(
      row
        ? z
            .object({
              clientId: z.string(),
              disabled: z.boolean().nullable(),
              name: z.string().nullable(),
            })
            .parse(row)
        : null,
    );
  },
  loadMcpGrant: (id: string) => Promise.resolve(fixture.grants.get(id) ?? null),
  loadMcpMember: (userId: string, organizationId: string) =>
    Promise.resolve(
      fixture.members.has(`${userId}:${organizationId}`)
        ? { banned: fixture.banned, role: "member" }
        : null,
    ),
  revokeMcpGrant: (id: string, userId: string) => {
    const grant = fixture.grants.get(id);
    if (!grant || grant.userId !== userId) {
      return Promise.resolve(false);
    }
    grant.revokedAt = new Date();
    return Promise.resolve(true);
  },
} satisfies McpManagementDependencies["store"] & Pick<McpRouteDependencies, "loadMcpGrant">;
const origin = "https://mcp.example.com";
const auth = betterAuth({
  baseURL: origin,
  database: memoryAdapter(database),
  emailAndPassword: { enabled: true },
  plugins: [...createMcpAuthPlugins(origin, store)],
  rateLimit: { enabled: false },
  secret: "mcp-test-secret-with-at-least-thirty-two-characters",
});
const createRequestWorkspaceAuthorizer = () => () => Promise.resolve(fixture.permitted);
type Reader = ReturnType<typeof createRecruitingReader>;
const reader: Reader = {
  getCandidate: vi.fn<Reader["getCandidate"]>(),
  getJob: vi.fn<Reader["getJob"]>(),
  getReport: vi.fn<Reader["getReport"]>(),
  listReports: vi.fn<Reader["listReports"]>(),
  searchCandidates: vi.fn<Reader["searchCandidates"]>(),
  searchJobs: vi.fn<Reader["searchJobs"]>().mockResolvedValue({
    page: 1,
    pageSize: 20,
    records: [{ code: "FE", id: "job-a", lifecycleStatus: "published", name: "前端工程师" }],
    total: 1,
  }),
};
const app = new Hono<Env>()
  .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .get("/.well-known/*", (c) => auth.handler(c.req.raw))
  .use(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session ? { ...session.user, banned: false, role: "user" } : null);
    c.set("session", session?.session ?? null);
    await next();
  })
  .route(
    "/api/mcp-access",
    createMcpManagementRouter({
      auth,
      baseURL: origin,
      createRequestWorkspaceAuthorizer,
      store,
      trustedOrigins: [origin],
    }),
  )
  .route(
    "/api/mcp",
    createMcpRouter({
      auth,
      baseURL: origin,
      ...store,
      createRequestWorkspaceAuthorizer,
      createServer: (_context, scopes) => createRecruitingMcpServer(reader, scopes),
      resolveRecruitingVisibilityScope: () => Promise.resolve({ kind: "all" }),
    }),
  );
const tokenSchema = z.object({ access_token: z.string(), refresh_token: z.string().optional() });
let cookie = "";
let userId = "";

function request(path: string, init?: RequestInit) {
  return app.fetch(new Request(new URL(path, origin), init));
}
function jsonPost(path: string, body: Record<string, JsonValue>, authenticated = false) {
  return request(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", cookie: authenticated ? cookie : "", origin },
    method: "POST",
  });
}
async function authorize(
  scopes = "jobs:read candidates:read reports:read offline_access",
  authenticated = true,
) {
  const registered = await jsonPost("/api/auth/oauth2/register", {
    application_type: "native",
    client_name: "Test CLI",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: ["http://localhost:49152/callback"],
    token_endpoint_auth_method: "none",
  });
  const registrationData = await registered.json();
  expect(registered.status, JSON.stringify(registrationData)).toBe(201);
  const client = z.object({ client_id: z.string() }).parse(registrationData);
  const verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({
    client_id: client.client_id,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    redirect_uri: "http://localhost:49152/callback",
    resource: `${origin}/api/mcp`,
    response_type: "code",
    scope: scopes,
    state: "client-state",
  });
  const response = await request(`/api/auth/oauth2/authorize?${query}`, {
    headers: { cookie: authenticated ? cookie : "" },
  });
  expect(response.status).toBe(302);
  const location = response.headers.get("location");
  expect(location).toContain("/mcp/authorize?");
  return {
    clientId: client.client_id,
    oauthQuery: new URL(z.string().parse(location), origin).search.slice(1),
    verifier,
  };
}
async function approve(
  flow: Awaited<ReturnType<typeof authorize>>,
  scopes = ["jobs:read", "candidates:read", "reports:read"],
) {
  const response = await jsonPost(
    "/api/mcp-access/consent",
    { accept: true, oauthQuery: flow.oauthQuery, scopes, workspaceId: "org-a" },
    true,
  );
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(200);
  const redirect = z.object({ url: z.string() }).parse(data);
  const url = new URL(redirect.url);
  expect(url.searchParams.get("state")).toBe("client-state");
  return z.string().parse(url.searchParams.get("code"));
}
function exchange(
  flow: Awaited<ReturnType<typeof authorize>>,
  code: string,
  verifier = flow.verifier,
) {
  return request("/api/auth/oauth2/token", {
    body: new URLSearchParams({
      client_id: flow.clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: "http://localhost:49152/callback",
      resource: `${origin}/api/mcp`,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
}
function rpc(accessToken: string | null, method: string, params?: Record<string, JsonValue>) {
  return request("/api/mcp", {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: {
      accept: "application/json, text/event-stream",
      authorization: accessToken ? `Bearer ${accessToken}` : "",
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function rpcBody(response: Response) {
  const body = await response.text();
  const data = body.startsWith("event:")
    ? body
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6)
    : body;
  return JSON.parse(data ?? "null");
}

beforeAll(async () => {
  vi.stubEnv("MCP_ENABLED", "true");
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    app.fetch(new Request(input, init)),
  );
  const response = await jsonPost("/api/auth/sign-up/email", {
    email: "recruiter@example.com",
    name: "测试招聘员",
    password: "test-password-12345",
  });
  expect(response.status).toBe(200);
  userId = z.object({ user: z.object({ id: z.string() }) }).parse(await response.json()).user.id;
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  fixture.members.add(`${userId}:org-a`);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("remote MCP OAuth using the official Better Auth and MCP implementations", () => {
  it("advertises the authorization server and challenges unauthenticated clients", async () => {
    const response = await rpc(null, "tools/list");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const metadata = await request("/.well-known/oauth-protected-resource/api/mcp");
    expect(await metadata.json()).toMatchObject({
      authorization_servers: [`${origin}/api/auth`],
      resource: `${origin}/api/mcp`,
    });
    const server = await request("/.well-known/oauth-authorization-server/api/auth");
    expect(await server.json()).toMatchObject({
      registration_endpoint: `${origin}/api/auth/oauth2/register`,
    });
  });
  it("completes DCR, signed consent, PKCE and read-only MCP discovery/call", async () => {
    const flow = await authorize();
    const code = await approve(flow);
    const response = await exchange(flow, code);
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    const tokens = tokenSchema.parse(data);
    const toolsResponse = await rpc(tokens.access_token, "tools/list");
    const tools = await rpcBody(toolsResponse);
    expect(toolsResponse.status, JSON.stringify(tools)).toBe(200);
    expect(tools).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            annotations: expect.objectContaining({ readOnlyHint: true }),
            description: expect.any(String),
            inputSchema: expect.any(Object),
            name: "search_jobs",
          }),
        ]),
      },
    });
    const call = await rpc(tokens.access_token, "tools/call", {
      arguments: {},
      name: "search_jobs",
    });
    expect(await call.text()).toContain("前端工程师");
    const response1 = await exchange(flow, code);
    expect(response1.status).toBe(400);
    const client = new Client({ name: "official-sdk-test", version: "1.0.0" });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${origin}/api/mcp`), {
          requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } },
        }),
      );
      const response2 = await client.listTools();
      expect(response2.tools).toHaveLength(6);
      expect(await client.callTool({ arguments: {}, name: "search_jobs" })).toMatchObject({
        content: expect.any(Array),
      });
    } finally {
      await client.close();
    }
  });
  it("continues the signed OAuth request after an interactive login", async () => {
    const flow = await authorize("jobs:read offline_access", false);
    const signedIn = await jsonPost("/api/auth/sign-in/email", {
      email: "recruiter@example.com",
      password: "test-password-12345",
    });
    expect(signedIn.status).toBe(200);
    const previousCookie = cookie;
    cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    try {
      const code = await approve(flow, ["jobs:read"]);
      const tokenResponse = await exchange(flow, code);
      expect(tokenResponse.status).toBe(200);
    } finally {
      cookie = previousCookie;
    }
  });
  it("rejects tampered consent, foreign workspaces, CSRF and direct consent bypass", async () => {
    const flow = await authorize();
    const tampered = new URLSearchParams(flow.oauthQuery);
    tampered.set("redirect_uri", "https://attacker.example/callback");
    const response3 = await jsonPost(
      "/api/mcp-access/consent",
      {
        accept: true,
        oauthQuery: tampered.toString(),
        scopes: ["jobs:read"],
        workspaceId: "org-a",
      },
      true,
    );
    expect(response3.status).toBe(400);
    const response4 = await jsonPost(
      "/api/mcp-access/consent",
      {
        accept: true,
        oauthQuery: flow.oauthQuery,
        scopes: ["jobs:read"],
        workspaceId: "org-b",
      },
      true,
    );
    expect(response4.status).toBe(403);
    const response5 = await request("/api/mcp-access/consent", {
      body: JSON.stringify({ accept: true, oauthQuery: flow.oauthQuery }),
      headers: {
        "content-type": "application/json",
        cookie,
        origin: "https://attacker.example",
      },
      method: "POST",
    });
    expect(response5.status).toBe(403);
    const response6 = await jsonPost(
      "/api/auth/oauth2/consent",
      { accept: true, oauth_query: flow.oauthQuery },
      true,
    );
    expect(response6.status).toBe(403);
  });
  it("rejects an incorrect PKCE verifier", async () => {
    const flow = await authorize();
    const response7 = await exchange(
      flow,
      await approve(flow),
      randomBytes(32).toString("base64url"),
    );
    expect(response7.status).toBe(401);
  });
  it("supports denial without creating an active grant", async () => {
    const flow = await authorize();
    const before = fixture.grants.size;
    const response = await jsonPost(
      "/api/mcp-access/consent",
      { accept: false, oauthQuery: flow.oauthQuery },
      true,
    );
    const redirect = z.object({ url: z.string() }).parse(await response.json());
    expect(new URL(redirect.url).searchParams.get("error")).toBe("access_denied");
    expect(fixture.grants.size).toBe(before);
  });
  it("enforces narrowed scopes, live permissions, membership and grant revocation", async () => {
    const flow = await authorize();
    const response8 = await exchange(flow, await approve(flow, ["jobs:read"]));
    const tokens = tokenSchema.parse(await response8.json());
    const list = await rpcBody(await rpc(tokens.access_token, "tools/list"));
    expect(list).toMatchObject({ result: { tools: expect.any(Array) } });
    expect(JSON.stringify(list)).not.toContain("get_candidate");
    fixture.permitted = false;
    const response9 = await rpc(tokens.access_token, "tools/list");
    expect(response9.status).toBe(403);
    fixture.permitted = true;
    fixture.members.delete(`${userId}:org-a`);
    const response10 = await rpc(tokens.access_token, "tools/list");
    expect(response10.status).toBe(403);
    fixture.members.add(`${userId}:org-a`);
    const refresh = () =>
      request("/api/auth/oauth2/token", {
        body: new URLSearchParams({
          client_id: flow.clientId,
          grant_type: "refresh_token",
          refresh_token: z.string().parse(tokens.refresh_token),
          resource: `${origin}/api/mcp`,
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
    const refreshed = await refresh();
    const refreshedData = await refreshed.json();
    expect(refreshed.status, JSON.stringify(refreshedData)).toBe(200);
    const refreshedTokens = tokenSchema.parse(refreshedData);
    const grant = [...fixture.grants.values()].find((item) => item.clientId === flow.clientId);
    if (!grant) {
      throw new Error("Expected workspace grant");
    }
    const revoked = await request(`/api/mcp-access/grants/${grant.id}`, {
      headers: { cookie, origin },
      method: "DELETE",
    });
    expect(revoked.status).toBe(200);
    const response11 = await rpc(tokens.access_token, "tools/list");
    expect(response11.status).toBe(401);
    const response12 = await rpc(refreshedTokens.access_token, "tools/list");
    expect(response12.status).toBe(401);
    const refreshAfterRevocation = await request("/api/auth/oauth2/token", {
      body: new URLSearchParams({
        client_id: flow.clientId,
        grant_type: "refresh_token",
        refresh_token: z.string().parse(refreshedTokens.refresh_token),
        resource: `${origin}/api/mcp`,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    expect(refreshAfterRevocation.status).toBeGreaterThanOrEqual(400);
  });
});
