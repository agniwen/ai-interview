import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { feishuAccountLinking } from "../feishu-account-linking";
import { createFeishuTenantProfileHooks } from "../feishu-tenant-profile";

const baseURL = "http://localhost:3456";
interface TenantProfile {
  feishuTenantKey?: string;
  feishuTenantName?: string;
}

function createFixture(sameEmail = false, localEmailVerified = false) {
  const cookies = new Map<string, string>();
  const tenantHooks = createFeishuTenantProfileHooks();
  const tenantProfile: TenantProfile = {
    feishuTenantKey: "tenant-1",
    feishuTenantName: "企业一",
  };
  const auth = betterAuth({
    account: { accountLinking: feishuAccountLinking },
    baseURL,
    database: memoryAdapter({ account: [], session: [], user: [], verification: [] }),
    databaseHooks: {
      account: {
        create: { after: tenantHooks.afterAccountSave },
        update: { after: tenantHooks.afterAccountSave },
      },
      user: { create: { before: tenantHooks.beforeUserCreate } },
    },
    plugins: [
      genericOAuth({
        config: ["feishu", "feishu-jiguang-hr", "google"].map((providerId) => ({
          accountIssuer: `local:oauth:${providerId}`,
          accountSubject: () => `${providerId}-open-id`,
          authorizationUrl: "http://provider.local/authorize",
          clientId: providerId,
          clientSecret: "test-secret",
          getToken: ({ code }) => Promise.resolve({ accessToken: code }),
          getUserInfo: () =>
            Promise.resolve({
              ...tenantProfile,
              email: sameEmail ? "member@example.com" : `${providerId}@feishu.local`,
              emailVerified:
                providerId === "google" || (providerId === "feishu" && localEmailVerified),
              id: `${providerId}-open-id`,
              name: providerId === "feishu" ? "原用户" : "HR 用户",
            }),
          mapProfileToUser: () => ({ ...tenantProfile }),
          pkce: false,
          providerId,
          tokenUrl: "http://provider.local/token",
        })),
      }),
    ],
    secret: "test-only-account-linking-secret-at-least-32-characters",
    user: {
      additionalFields: {
        feishuTenantKey: { input: false, required: false, type: "string" },
        feishuTenantName: { input: false, required: false, type: "string" },
      },
      validateUserInfo: tenantHooks.validateUserInfo,
    },
  });
  async function request(
    path: string,
    body?:
      | TenantProfile
      | {
          provider: string;
          callbackURL: string;
          additionalData?: { link: { email: string; userId: string } };
        },
  ) {
    const response = await auth.handler(
      new Request(`${baseURL}${path}`, {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          "content-type": "application/json",
          cookie: [...cookies.values()].join("; "),
          origin: baseURL,
        },
        method: body ? "POST" : "GET",
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const [value] = cookie.split(";");
      const [name] = value.split("=");
      cookies.set(name, value);
    }
    return response;
  }
  async function authorize(
    provider: string,
    link = false,
    additionalData?: { link: { email: string; userId: string } },
  ) {
    const response = await request(link ? "/api/auth/link-social" : "/api/auth/sign-in/social", {
      additionalData,
      callbackURL: `${baseURL}/complete`,
      provider,
    });
    const payload = z.object({ url: z.string() }).parse(await response.json());
    const state = new URL(payload.url).searchParams.get("state");
    return request(
      `/api/auth/callback/${provider}?state=${encodeURIComponent(state ?? "")}&code=verified-code`,
    );
  }
  async function readSession() {
    const response = await request("/api/auth/get-session");
    return z
      .object({ user: z.object({ email: z.string(), id: z.string(), name: z.string() }) })
      .parse(await response.json());
  }
  async function readAccounts() {
    const response = await request("/api/auth/list-accounts");
    return z.array(z.object({ providerId: z.string() })).parse(await response.json());
  }
  async function readTenant() {
    const response = await request("/api/auth/get-session");
    return z
      .object({
        user: z.object({
          feishuTenantKey: z.string().nullable().optional(),
          feishuTenantName: z.string().nullable().optional(),
        }),
      })
      .parse(await response.json()).user;
  }
  return { auth, authorize, readAccounts, readSession, readTenant, request, tenantProfile };
}

describe("explicit Feishu HR account linking", () => {
  it("keeps the original user when explicitly linking different per-app synthetic emails", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    const response = await fixture.authorize("feishu-jiguang-hr", true);
    expect(response.headers.get("location")).toBe(`${baseURL}/complete`);
    const after = await fixture.readSession();
    expect(after.user).toEqual(before.user);
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item) => item.providerId).toSorted()).toEqual([
      "feishu",
      "feishu-jiguang-hr",
    ]);
    await fixture.authorize("feishu-jiguang-hr");
    const hrLogin = await fixture.readSession();
    expect(hrLogin.user.id).toBe(before.user.id);
  });

  it("refuses implicit email-based merging even when the local email is verified", async () => {
    const fixture = createFixture(true, true);
    await fixture.authorize("feishu");
    const response = await fixture.authorize("feishu-jiguang-hr");
    expect(response.headers.get("location")).toContain("error=account_not_linked");
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item: { providerId: string }) => item.providerId)).toEqual(["feishu"]);
  });

  it("explicitly links the same real email without requiring an unverified local email to be trusted", async () => {
    const fixture = createFixture(true);
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    const response = await fixture.authorize("feishu-jiguang-hr", true);
    expect(response.headers.get("location")).toBe(`${baseURL}/complete`);
    const after = await fixture.readSession();
    expect(after.user).toEqual(before.user);
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item) => item.providerId).toSorted()).toEqual([
      "feishu",
      "feishu-jiguang-hr",
    ]);
  });

  it("refuses to move an HR account already owned by another user", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu-jiguang-hr");
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    const response = await fixture.authorize("feishu-jiguang-hr", true);
    expect(response.headers.get("location")).toContain(
      "error=account_already_linked_to_different_user",
    );
    const after = await fixture.readSession();
    expect(after.user).toEqual(before.user);
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item: { providerId: string }) => item.providerId)).toEqual(["feishu"]);
  });

  it("requires an authenticated original account before linking", async () => {
    const fixture = createFixture();
    const response = await fixture.request("/api/auth/link-social", {
      callbackURL: `${baseURL}/complete`,
      provider: "feishu-jiguang-hr",
    });
    expect(response.status).toBe(401);
  });

  it("preserves Google automatic linking when both emails are verified", async () => {
    const fixture = createFixture(true, true);
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    const response = await fixture.authorize("google");
    expect(response.headers.get("location")).toBe(`${baseURL}/complete`);
    const after = await fixture.readSession();
    expect(after.user.id).toBe(before.user.id);
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item) => item.providerId).toSorted()).toEqual(["feishu", "google"]);
    await fixture.authorize("google");
    const returning = await fixture.readSession();
    expect(returning.user.id).toBe(before.user.id);
  });

  it("still refuses Google automatic linking to an unverified local email", async () => {
    const fixture = createFixture(true);
    await fixture.authorize("feishu");
    const response = await fixture.authorize("google");
    expect(response.headers.get("location")).toContain("error=account_not_linked");
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item) => item.providerId)).toEqual(["feishu"]);
  });

  it.each(["feishu", "feishu-jiguang-hr"])(
    "%s cannot implicitly link to a verified Google user",
    async (providerId) => {
      const fixture = createFixture(true);
      await fixture.authorize("google");
      const response = await fixture.authorize(providerId);
      expect(response.headers.get("location")).toContain("error=account_not_linked");
      const accounts = await fixture.readAccounts();
      expect(accounts.map((item) => item.providerId)).toEqual(["google"]);
    },
  );

  it("does not accept a client-supplied link marker as explicit authorization", async () => {
    const fixture = createFixture(true, true);
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    const response = await fixture.authorize("feishu-jiguang-hr", false, {
      link: { email: before.user.email, userId: before.user.id },
    });
    expect(response.headers.get("location")).toContain("error=account_not_linked");
    const accounts = await fixture.readAccounts();
    expect(accounts.map((item) => item.providerId)).toEqual(["feishu"]);
  });
});

describe("server-owned Feishu tenant persistence", () => {
  it.each(["feishu", "feishu-jiguang-hr"])(
    "persists %s tenant through OAuth signup",
    async (provider) => {
      const fixture = createFixture();
      const response = await fixture.authorize(provider);
      expect(response.headers.get("location")).toBe(`${baseURL}/complete`);
      expect(await fixture.readTenant()).toEqual(fixture.tenantProfile);
    },
  );

  it("backfills a returning user's missing tenant without replacing their profile", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu");
    const { user } = await fixture.readSession();
    const context = await fixture.auth.$context;
    await context.internalAdapter.updateUser(user.id, {
      feishuTenantKey: null,
      feishuTenantName: null,
      name: "用户修改的姓名",
    });
    await fixture.authorize("feishu");
    expect(await fixture.readTenant()).toEqual(fixture.tenantProfile);
    const session = await fixture.readSession();
    expect(session.user.name).toBe("用户修改的姓名");
  });

  it("syncs an explicitly linked account and preserves the original email", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu");
    const before = await fixture.readSession();
    fixture.tenantProfile.feishuTenantKey = "tenant-2";
    fixture.tenantProfile.feishuTenantName = "企业二";
    await fixture.authorize("feishu-jiguang-hr", true);
    expect(await fixture.readTenant()).toEqual(fixture.tenantProfile);
    const after = await fixture.readSession();
    expect(after.user).toEqual(before.user);
  });

  it("preserves known tenant data when lookups are incomplete", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu");
    delete fixture.tenantProfile.feishuTenantName;
    await fixture.authorize("feishu");
    expect(await fixture.readTenant()).toEqual({
      feishuTenantKey: "tenant-1",
      feishuTenantName: "企业一",
    });
    delete fixture.tenantProfile.feishuTenantKey;
    await fixture.authorize("feishu");
    expect(await fixture.readTenant()).toEqual({
      feishuTenantKey: "tenant-1",
      feishuTenantName: "企业一",
    });
    fixture.tenantProfile.feishuTenantKey = "tenant-2";
    await fixture.authorize("feishu");
    expect(await fixture.readTenant()).toEqual({
      feishuTenantKey: "tenant-2",
      feishuTenantName: null,
    });
  });

  it("rejects client attempts to overwrite server-owned tenant fields", async () => {
    const fixture = createFixture();
    await fixture.authorize("feishu");
    await fixture.request("/api/auth/update-user", {
      feishuTenantKey: "forged-tenant",
      feishuTenantName: "伪造企业",
    });
    expect(await fixture.readTenant()).toEqual(fixture.tenantProfile);
  });

  it("does not accept tenant claims from another OAuth provider", async () => {
    const fixture = createFixture();
    await fixture.authorize("google");
    const tenant = await fixture.readTenant();
    expect(tenant.feishuTenantKey ?? null).toBeNull();
    expect(tenant.feishuTenantName ?? null).toBeNull();
  });
});
