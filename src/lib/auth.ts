import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import { db } from "./db";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = [...new Set([baseURL, "http://localhost:3000"])];

function pickFirstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => typeof v === "string" && v.length > 0);
}

interface FeishuTokenResponse {
  code?: number;
  msg?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface FeishuUserInfoResponse {
  code: number;
  msg: string;
  data?: {
    open_id: string;
    union_id?: string;
    user_id?: string;
    tenant_key?: string;
    name?: string;
    en_name?: string;
    email?: string;
    enterprise_email?: string;
    mobile?: string;
    avatar_url?: string;
  };
}

interface FeishuTenantTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuTenantQueryResponse {
  code: number;
  msg: string;
  data?: {
    tenant?: {
      name?: string;
      display_id?: string;
      tenant_tag?: number;
      tenant_key?: string;
      avatar?: Record<string, string>;
    };
  };
}

// Short-lived in-memory cache to avoid minting a new tenant_access_token on every login.
let tenantTokenCache: { token: string; expiresAt: number } | null = null;

async function fetchFeishuTenantToken(): Promise<string | null> {
  const now = Date.now();
  if (tenantTokenCache && tenantTokenCache.expiresAt > now + 60_000) {
    return tenantTokenCache.token;
  }
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
  });
  const json = (await res.json()) as FeishuTenantTokenResponse;
  if (json.code !== 0 || !json.tenant_access_token) {
    return null;
  }
  tenantTokenCache = {
    expiresAt: now + (json.expire ?? 7200) * 1000,
    token: json.tenant_access_token,
  };
  return json.tenant_access_token;
}

async function fetchFeishuOrganizationName(): Promise<string | null> {
  try {
    const token = await fetchFeishuTenantToken();
    if (!token) {
      return null;
    }
    const res = await fetch("https://open.feishu.cn/open-apis/tenant/v2/tenant/query", {
      headers: { authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as FeishuTenantQueryResponse;
    if (json.code !== 0) {
      return null;
    }
    return json.data?.tenant?.name ?? null;
  } catch {
    // Org name is best-effort; don't block login on failure.
    return null;
  }
}

export const auth = betterAuth({
  appName: "简历筛选助手",
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  plugins: [
    admin(),
    genericOAuth({
      config: [
        // oxlint-disable-next-line sort-keys -- OAuth config keeps related fields grouped (id/secret, token/endpoints), not alphabetical.
        {
          providerId: "feishu",
          clientId: process.env.FEISHU_APP_ID ?? "",
          clientSecret: process.env.FEISHU_APP_SECRET ?? "",
          authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
          // Required by the plugin's config validation, but not actually called —
          // `getToken` below handles the JSON-only v2 token exchange.
          tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
          scopes: ["contact:user.base:readonly", "contact:user.email:readonly"],
          async getToken({ code, redirectURI }) {
            const res = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
              body: JSON.stringify({
                client_id: process.env.FEISHU_APP_ID,
                client_secret: process.env.FEISHU_APP_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: redirectURI,
              }),
              headers: { "content-type": "application/json; charset=utf-8" },
              method: "POST",
            });
            const json = (await res.json()) as FeishuTokenResponse;
            if (!res.ok || !json.access_token) {
              throw new Error(
                `Feishu token exchange failed: ${json.code ?? res.status} ${json.msg ?? ""}`,
              );
            }
            return {
              accessToken: json.access_token,
              accessTokenExpiresAt: json.expires_in
                ? new Date(Date.now() + json.expires_in * 1000)
                : undefined,
              raw: json as unknown as Record<string, unknown>,
              refreshToken: json.refresh_token,
              refreshTokenExpiresAt: json.refresh_token_expires_in
                ? new Date(Date.now() + json.refresh_token_expires_in * 1000)
                : undefined,
              scopes: json.scope?.split(" ").filter(Boolean),
              tokenType: json.token_type ?? "Bearer",
            };
          },
          async getUserInfo(tokens) {
            const [userInfoRes, organizationName] = await Promise.all([
              fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
                headers: { authorization: `Bearer ${tokens.accessToken}` },
              }),
              fetchFeishuOrganizationName(),
            ]);
            const json = (await userInfoRes.json()) as FeishuUserInfoResponse;
            if (json.code !== 0 || !json.data) {
              return null;
            }
            const { data } = json;
            const email =
              pickFirstNonEmpty(data.enterprise_email, data.email) ??
              `${data.open_id}@feishu.local`;
            const name = pickFirstNonEmpty(data.name, data.en_name) ?? data.open_id;
            return {
              email,
              emailVerified: false,
              id: data.open_id,
              image: pickFirstNonEmpty(data.avatar_url),
              name,
              organizationId: pickFirstNonEmpty(data.tenant_key),
              organizationName: organizationName ?? undefined,
            };
          },
        },
      ],
    }),
  ],
  trustedOrigins,
  user: {
    additionalFields: {
      organizationId: {
        input: false,
        required: false,
        type: "string",
      },
      organizationName: {
        input: false,
        required: false,
        type: "string",
      },
    },
  },
});
