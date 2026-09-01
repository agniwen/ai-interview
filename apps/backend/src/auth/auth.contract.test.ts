import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTrustedOrigins } from "./better-auth.factory.js";
import { configuredFeishuProviders } from "./feishu-oauth.js";
import { resolveSessionAuthProviderId } from "./session-auth-provider.js";
import { canAssignWorkspaceRole } from "./workspace-role-policy.js";
import type { Database } from "../infrastructure/database/database.tokens.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session authentication provider attribution", () => {
  it("records OAuth callbacks and email credentials without deriving authorization state", () => {
    expect(resolveSessionAuthProviderId({ params: { id: "google" }, path: "/callback/:id" })).toBe(
      "google",
    );
    expect(
      resolveSessionAuthProviderId({
        params: { providerId: "feishu-jiguang-hr" },
        path: "/oauth2/callback/:providerId",
      }),
    ).toBe("feishu-jiguang-hr");
    expect(resolveSessionAuthProviderId({ path: "/sign-in/email" })).toBe("credential");
    expect(resolveSessionAuthProviderId({ path: "/get-session" })).toBeNull();
  });
});

describe("trusted browser origins", () => {
  it("extends the desktop and web defaults and removes duplicates", () => {
    const origins = resolveTrustedOrigins({
      BETTER_AUTH_TRUSTED_ORIGINS: "https://desktop.example,http://localhost:3000",
      BETTER_AUTH_URL: "https://api.example",
      TRUSTED_ORIGINS: "https://admin.example",
    });

    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("https://api.example");
    expect(origins).toContain("https://desktop.example");
    expect(origins).toContain("https://admin.example");
    expect(origins.filter((origin) => origin === "http://localhost:3000")).toHaveLength(1);
  });
});

describe("Feishu OAuth providers", () => {
  it("fails fast when a provider is only partially configured", () => {
    expect(() => configuredFeishuProviders({ FEISHU_APP_ID: "app-id" })).toThrow(
      "requires both app id and app secret",
    );
  });

  it("keeps both provider identities and enriches the user with tenant metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((request: string | URL | Request) => {
        const url = request.toString();
        if (url.includes("tenant_access_token")) {
          return Promise.resolve(
            Response.json({ code: 0, expire: 7200, tenant_access_token: "tenant-token" }),
          );
        }
        if (url.includes("tenant/v2/tenant/query")) {
          return Promise.resolve(
            Response.json({ code: 0, data: { tenant: { name: "极光招聘" } } }),
          );
        }
        if (url.includes("authen/v1/user_info")) {
          return Promise.resolve(
            Response.json({
              code: 0,
              data: {
                avatar_url: "https://example.test/avatar.png",
                enterprise_email: "recruiter@example.test",
                name: "招聘官",
                open_id: "ou_test",
                tenant_key: "tenant-key",
              },
            }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    const providers = configuredFeishuProviders({
      FEISHU_APP_ID: "app-one",
      FEISHU_APP_ID2: "app-two",
      FEISHU_APP_SECRET: "secret-one",
      FEISHU_APP_SECRET2: "secret-two",
    });

    expect(providers.map((provider) => provider.providerId)).toEqual([
      "feishu",
      "feishu-jiguang-hr",
    ]);
    const userInfo = await providers[1]?.getUserInfo?.({ accessToken: "access-token" });
    expect(userInfo).toMatchObject({
      email: "recruiter@example.test",
      feishuTenantKey: "tenant-key",
      feishuTenantName: "极光招聘",
      id: "ou_test",
      name: "招聘官",
    });
  });
});

describe("workspace role assignment policy", () => {
  it("keeps built-in roles strictly below the caller", async () => {
    // SAFETY: built-in role comparisons return before consulting the database.
    const unusedDatabase = {} as Database;

    await expect(
      canAssignWorkspaceRole(unusedDatabase, {
        invokerRole: "owner",
        organizationId: "org",
        targetRole: "admin",
      }),
    ).resolves.toBe(true);
    await expect(
      canAssignWorkspaceRole(unusedDatabase, {
        invokerRole: "admin",
        organizationId: "org",
        targetRole: "owner",
      }),
    ).resolves.toBe(false);
    await expect(
      canAssignWorkspaceRole(unusedDatabase, {
        invokerRole: "member",
        organizationId: "org",
        targetRole: "noAccess",
      }),
    ).resolves.toBe(true);
  });
});
