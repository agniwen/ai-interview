import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { feishuAccountLinking, validateFeishuAccountLinking } from "../feishu-account-linking";

const baseURL = "http://localhost:3456";

function createFixture(sameEmail = false, localEmailVerified = false) {
  const cookies = new Map<string, string>();
  const auth = betterAuth({
    account: { accountLinking: feishuAccountLinking },
    baseURL,
    database: memoryAdapter({ account: [], session: [], user: [], verification: [] }),
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
              email: sameEmail ? "member@example.com" : `${providerId}@feishu.local`,
              emailVerified:
                providerId === "google" || (providerId === "feishu" && localEmailVerified),
              id: `${providerId}-open-id`,
              name: providerId === "feishu" ? "原用户" : "HR 用户",
            }),
          pkce: false,
          providerId,
          tokenUrl: "http://provider.local/token",
        })),
      }),
    ],
    secret: "test-only-account-linking-secret-at-least-32-characters",
    user: { validateUserInfo: validateFeishuAccountLinking },
  });
  async function request(
    path: string,
    body?: {
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
  return { authorize, readAccounts, readSession, request };
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
