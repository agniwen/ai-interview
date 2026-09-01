/* oxlint-disable anti-slop/no-module-mocking, no-inline-comments -- The frozen legacy app has no DI seam; test-only module substitution isolates its mount/CORS/Auth shell without changing production code. Vite requires its dynamic-import escape hatch inline. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BackendTestHarness } from "./backend-test-harness.js";
import { createBackendTestHarness } from "./backend-test-harness.js";

interface LegacyServerApp {
  request(input: RequestInfo | URL, requestInit?: RequestInit): Promise<Response>;
}

const TEST_ENVIRONMENT = {
  BETTER_AUTH_SECRET: "protocol-parity-secret-protocol-parity-secret",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgres://backend:backend@127.0.0.1:5432/backend_contract",
  FEISHU_APP_ID: "protocol-test",
  FEISHU_APP_ID2: "protocol-test-secondary",
  FEISHU_APP_SECRET: "protocol-test",
  FEISHU_APP_SECRET2: "protocol-test-secondary",
  GOOGLE_CLIENT_ID: "protocol-test",
  GOOGLE_CLIENT_SECRET: "protocol-test",
  NODE_ENV: "test",
} as const;

const previousEnvironment = new Map<string, string | undefined>();
let backend: BackendTestHarness;
let legacy: LegacyServerApp;

beforeAll(async () => {
  for (const [name, value] of Object.entries(TEST_ENVIRONMENT)) {
    previousEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
  const legacyRouterStub = { routes: [] };
  const legacyRouteModules = {
    "../../../server/src/server/routes/agent/route-runtime.ts": "agentRouter",
    "../../../server/src/server/routes/interview/route.ts": "interviewRouter",
    "../../../server/src/server/routes/join/route.ts": "joinRouter",
    "../../../server/src/server/routes/livekit/route.ts": "livekitRouter",
    "../../../server/src/server/routes/meeting-local-recovery/route.ts":
      "meetingLocalRecoveryRouter",
    "../../../server/src/server/routes/platform/route.ts": "platformRouter",
    "../../../server/src/server/routes/public/route.ts": "publicRouter",
    "../../../server/src/server/routes/resume/route.ts": "resumeRouter",
    "../../../server/src/server/routes/workspace/route.ts": "workspaceRouter",
  } as const;
  for (const [modulePath, exportName] of Object.entries(legacyRouteModules)) {
    const moduleId = new URL(modulePath, import.meta.url).pathname;
    vi.doMock(moduleId, () => ({ [exportName]: legacyRouterStub }));
  }
  const legacyModulePath = new URL("../../../server/src/server/app.ts", import.meta.url).href;
  // SAFETY: the unchanged legacy module is narrowed to its public Hono request boundary.
  const legacyModule = (await import(/* @vite-ignore */ legacyModulePath)) as {
    createServerApp(): LegacyServerApp;
  };
  legacy = legacyModule.createServerApp();
  backend = await createBackendTestHarness({ backgroundWorkersEnabled: false });
}, 30_000);

afterAll(async () => {
  await backend?.close();
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, name);
    } else {
      process.env[name] = value;
    }
  }
}, 30_000);

describe("legacy-to-Nest protocol parity", () => {
  it("preserves trusted-origin credentialed CORS preflight semantics", async () => {
    const headers = {
      "Access-Control-Request-Headers": "Content-Type,Authorization",
      "Access-Control-Request-Method": "GET",
      Origin: "http://localhost:3000",
    };
    const legacyResponse = await legacy.request("http://localhost/api/join/not-valid/preview", {
      headers,
      method: "OPTIONS",
    });
    const nestResponse = await backend.http
      .options("/public/workspace-invites/not-valid/preview")
      .set(headers);

    expect(nestResponse.status).toBe(legacyResponse.status);
    expect(nestResponse.headers["access-control-allow-origin"]).toBe(
      legacyResponse.headers.get("access-control-allow-origin"),
    );
    expect(nestResponse.headers["access-control-allow-credentials"]).toBe(
      legacyResponse.headers.get("access-control-allow-credentials"),
    );
    expect(nestResponse.headers["access-control-allow-methods"]).toBe(
      legacyResponse.headers.get("access-control-allow-methods"),
    );
    expect(nestResponse.headers["access-control-allow-headers"]).toBe(
      legacyResponse.headers.get("access-control-allow-headers"),
    );

    const untrustedHeaders = { ...headers, Origin: "https://untrusted.example" };
    const legacyUntrustedResponse = await legacy.request(
      "http://localhost/api/join/not-valid/preview",
      { headers: untrustedHeaders, method: "OPTIONS" },
    );
    const nestUntrustedResponse = await backend.http
      .options("/public/workspace-invites/not-valid/preview")
      .set(untrustedHeaders);

    expect(nestUntrustedResponse.headers["access-control-allow-origin"] ?? null).toBe(
      legacyUntrustedResponse.headers.get("access-control-allow-origin"),
    );
  });

  it("preserves Better Auth callback redirect and cookie protocol without following it", async () => {
    const legacyPath = "/api/auth/callback/google?error=access_denied&error_description=denied";
    const nestPath = "/public/auth/callback/google?error=access_denied&error_description=denied";
    const headers = { Origin: "http://localhost:3000" };
    const legacyResponse = await legacy.request(`http://localhost${legacyPath}`, { headers });
    const nestResponse = await backend.http.get(nestPath).set(headers).redirects(0);

    expect(nestResponse.status).toBe(legacyResponse.status);
    expect(nestResponse.headers.location ?? null).toBe(legacyResponse.headers.get("location"));
    expect(nestResponse.headers["set-cookie"] ?? []).toEqual(legacyResponse.headers.getSetCookie());
    expect(nestResponse.headers["access-control-allow-origin"]).toBe(
      legacyResponse.headers.get("access-control-allow-origin"),
    );
    expect(nestResponse.headers["access-control-allow-credentials"]).toBe(
      legacyResponse.headers.get("access-control-allow-credentials"),
    );
  });
});
