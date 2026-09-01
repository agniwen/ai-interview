import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { z } from "zod";

const tenantAccessTokenResponseSchema = z.object({
  code: z.number(),
  expire: z.number().optional(),
  msg: z.string().optional(),
  tenant_access_token: z.string().optional(),
});

const tenantQueryResponseSchema = z.object({
  code: z.number(),
  data: z.object({ tenant: z.object({ name: z.string().optional() }).optional() }).optional(),
  msg: z.string().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  code: z.number().optional(),
  expires_in: z.number().optional(),
  msg: z.string().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const userInfoResponseSchema = z.object({
  code: z.number(),
  data: z
    .object({
      avatar_url: z.string().optional(),
      email: z.string().optional(),
      en_name: z.string().optional(),
      enterprise_email: z.string().optional(),
      mobile: z.string().optional(),
      name: z.string().optional(),
      open_id: z.string(),
      tenant_key: z.string().optional(),
      union_id: z.string().optional(),
      user_id: z.string().optional(),
    })
    .optional(),
  msg: z.string().optional(),
});

const tenantTokenCache = new Map<string, { expiresAt: number; token: string }>();

function pickFirstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((value): value is string => value !== undefined && value.length > 0);
}

export async function getFeishuTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  const now = Date.now();
  const cached = tenantTokenCache.get(appId);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST",
    },
  );
  const parsed = tenantAccessTokenResponseSchema.safeParse(await response.json());
  const result = parsed.success ? parsed.data : null;
  if (!result || !response.ok || result.code !== 0 || !result.tenant_access_token) {
    throw new Error(
      `Feishu tenant token request failed: ${result?.code ?? response.status} ${result?.msg ?? "Invalid response payload"}`,
    );
  }
  tenantTokenCache.set(appId, {
    expiresAt: now + (result.expire ?? 7200) * 1000,
    token: result.tenant_access_token,
  });
  return result.tenant_access_token;
}

async function fetchFeishuOrganizationName(
  appId: string,
  appSecret: string,
): Promise<string | null> {
  try {
    const token = await getFeishuTenantAccessToken(appId, appSecret);
    const response = await fetch("https://open.feishu.cn/open-apis/tenant/v2/tenant/query", {
      headers: { authorization: `Bearer ${token}` },
    });
    const result = tenantQueryResponseSchema.parse(await response.json());
    return result.code === 0 ? (result.data?.tenant?.name ?? null) : null;
  } catch {
    return null;
  }
}

export interface FeishuOAuthProviderOptions {
  appId: string;
  appSecret: string;
  providerId: string;
}

export function buildFeishuOAuthProvider(input: FeishuOAuthProviderOptions): GenericOAuthConfig {
  return {
    accountIssuer: `local:oauth:${encodeURIComponent(input.providerId)}`,
    accountSubject: ({ profile }) => {
      if (profile.id === null || profile.id === undefined || profile.id === "") {
        throw new Error(`Feishu provider ${input.providerId} returned no stable account id.`);
      }
      return profile.id;
    },
    authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    clientId: input.appId,
    clientSecret: input.appSecret,
    async getToken({ code, redirectURI }) {
      const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
        body: JSON.stringify({
          client_id: input.appId,
          client_secret: input.appSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectURI,
        }),
        headers: { "content-type": "application/json; charset=utf-8" },
        method: "POST",
      });
      const result = tokenResponseSchema.parse(await response.json());
      if (!response.ok || !result.access_token) {
        throw new Error(
          `Feishu token exchange failed: ${result.code ?? response.status} ${result.msg ?? ""}`,
        );
      }
      return {
        accessToken: result.access_token,
        accessTokenExpiresAt: result.expires_in
          ? new Date(Date.now() + result.expires_in * 1000)
          : undefined,
        raw: z.record(z.string(), z.json()).parse(result),
        refreshToken: result.refresh_token,
        refreshTokenExpiresAt: result.refresh_token_expires_in
          ? new Date(Date.now() + result.refresh_token_expires_in * 1000)
          : undefined,
        scopes: result.scope?.split(" ").filter(Boolean),
        tokenType: result.token_type ?? "Bearer",
      };
    },
    async getUserInfo(tokens) {
      const [response, tenantName] = await Promise.all([
        fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
          headers: { authorization: `Bearer ${tokens.accessToken}` },
        }),
        fetchFeishuOrganizationName(input.appId, input.appSecret),
      ]);
      const result = userInfoResponseSchema.parse(await response.json());
      if (result.code !== 0 || !result.data) {
        return null;
      }
      const email =
        pickFirstNonEmpty(result.data.enterprise_email, result.data.email) ??
        `${result.data.open_id}@feishu.local`;
      return {
        email,
        emailVerified: false,
        feishuTenantKey: pickFirstNonEmpty(result.data.tenant_key),
        feishuTenantName: tenantName ?? undefined,
        id: result.data.open_id,
        image: pickFirstNonEmpty(result.data.avatar_url),
        name: pickFirstNonEmpty(result.data.name, result.data.en_name) ?? result.data.open_id,
      };
    },
    pkce: false,
    providerId: input.providerId,
    scopes: ["contact:user.base:readonly", "contact:user.email:readonly"],
    tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
  };
}

export interface FeishuOAuthEnvironment {
  FEISHU_APP_ID?: string;
  FEISHU_APP_ID2?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_APP_SECRET2?: string;
}

export function configuredFeishuProviders(
  environment: FeishuOAuthEnvironment,
): GenericOAuthConfig[] {
  const candidates = [
    {
      appId: environment.FEISHU_APP_ID,
      appSecret: environment.FEISHU_APP_SECRET,
      providerId: "feishu",
    },
    {
      appId: environment.FEISHU_APP_ID2,
      appSecret: environment.FEISHU_APP_SECRET2,
      providerId: "feishu-jiguang-hr",
    },
  ];
  return candidates.flatMap((candidate) => {
    if (Boolean(candidate.appId) !== Boolean(candidate.appSecret)) {
      throw new Error(`${candidate.providerId} requires both app id and app secret.`);
    }
    return candidate.appId && candidate.appSecret
      ? [
          buildFeishuOAuthProvider({
            appId: candidate.appId,
            appSecret: candidate.appSecret,
            providerId: candidate.providerId,
          }),
        ]
      : [];
  });
}
