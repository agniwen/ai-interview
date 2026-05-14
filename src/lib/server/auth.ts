import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";
import { ac, roles } from "@/lib/shared/permissions";
import { db } from "./db";
import * as schema from "@/lib/shared/db/schema";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const trustedOrigins = [...new Set([baseURL, "http://localhost:3000"])];

// 模块加载时一次性打印解析出的关键配置，便于在生产 logs 里反查 redirect_uri_mismatch
// 与 callback host 偏移类问题（绝大部分 Google 登录失败都源于这三处 URL 不一致：
// BETTER_AUTH_URL / Google Console 注册的 redirect URI / 浏览器实际 origin）。
// One-shot startup log of the resolved auth URLs — most Google login failures
// trace back to mismatches between these values, the Google Console redirect
// URI, and the browser's actual origin.
console.log("[auth:init]", {
  baseURL,
  expectedGoogleRedirectURI: `${baseURL}/api/auth/callback/google`,
  hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
  hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  nodeEnv: process.env.NODE_ENV,
  trustedOrigins,
});

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
// Keyed by appId so each registered Feishu app has its own cached token.
const tenantTokenCache = new Map<string, { token: string; expiresAt: number }>();

async function fetchFeishuTenantToken(appId: string, appSecret: string): Promise<string | null> {
  const now = Date.now();
  const cached = tenantTokenCache.get(appId);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
  });
  const json = (await res.json()) as FeishuTenantTokenResponse;
  if (json.code !== 0 || !json.tenant_access_token) {
    return null;
  }
  tenantTokenCache.set(appId, {
    expiresAt: now + (json.expire ?? 7200) * 1000,
    token: json.tenant_access_token,
  });
  return json.tenant_access_token;
}

async function fetchFeishuOrganizationName(
  appId: string,
  appSecret: string,
): Promise<string | null> {
  try {
    const token = await fetchFeishuTenantToken(appId, appSecret);
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

interface FeishuOAuthProviderOptions {
  providerId: string;
  appId: string;
  appSecret: string;
}

function buildFeishuOAuthProvider(opts: FeishuOAuthProviderOptions): GenericOAuthConfig {
  const { appId, appSecret, providerId } = opts;
  // oxlint-disable-next-line sort-keys -- OAuth config keeps related fields grouped (id/secret, token/endpoints), not alphabetical.
  return {
    providerId,
    clientId: appId,
    clientSecret: appSecret,
    authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    // Required by the plugin's config validation, but not actually called —
    // `getToken` below handles the JSON-only v2 token exchange.
    tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    scopes: ["contact:user.base:readonly", "contact:user.email:readonly"],
    async getToken({ code, redirectURI }) {
      const res = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
        body: JSON.stringify({
          client_id: appId,
          client_secret: appSecret,
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
        fetchFeishuOrganizationName(appId, appSecret),
      ]);
      const json = (await userInfoRes.json()) as FeishuUserInfoResponse;
      if (json.code !== 0 || !json.data) {
        return null;
      }
      const { data } = json;
      const email =
        pickFirstNonEmpty(data.enterprise_email, data.email) ?? `${data.open_id}@feishu.local`;
      const name = pickFirstNonEmpty(data.name, data.en_name) ?? data.open_id;
      return {
        email,
        emailVerified: false,
        feishuTenantKey: pickFirstNonEmpty(data.tenant_key),
        feishuTenantName: organizationName ?? undefined,
        id: data.open_id,
        image: pickFirstNonEmpty(data.avatar_url),
        name,
      };
    },
  };
}

// Docker / 反向代理 (Nginx, Caddy, Traefik 等) 部署专用：让 better-auth 信任反代
// 转发的 x-forwarded-proto / x-forwarded-host，否则容器内只看到 http://localhost:3000，
// 算出来的 baseURL 协议错 → cookie 的 Secure 维度对不上，OAuth state / PKCE cookie
// 跨"浏览器 ↔ Google ↔ 我们站点"链路时被浏览器丢弃 → token exchange 拿不到
// code_verifier → Google 返回 invalid_grant → better-auth 包装成 invalid_code。
// production-only —— dev 环境（HTTP 本机）开了反而会让 cookie 走错协议。
// For Docker / reverse-proxy deployments, trust the proxy's
// x-forwarded-proto / x-forwarded-host. Otherwise the container only sees
// http://localhost:3000, computed cookie attributes (Secure) don't match what
// the browser expects on HTTPS, the OAuth state / PKCE cookies are dropped
// across the browser ↔ Google ↔ our-site bounce, token exchange runs without
// a valid code_verifier, Google returns invalid_grant and better-auth wraps
// it as invalid_code. Production-only — enabling this in HTTP-dev would flip
// cookies into the wrong protocol bucket.
const advanced =
  process.env.NODE_ENV === "production"
    ? {
        // 让 better-auth 把请求识别成它本来的样子 (https) 而不是反代上游的 http。
        // Make better-auth see the original https scheme instead of the proxy's http hop.
        trustedProxyHeaders: true,
        // 显式声明使用 Secure cookie——配合 trustedProxyHeaders，能让 better-auth
        // 同时把 Set-Cookie 带上 Secure 标记，浏览器才肯保存。
        // Explicit Secure flag pairs with trustedProxyHeaders so Set-Cookie carries
        // Secure and the browser persists it on https://...
        useSecureCookies: true,
      }
    : undefined;

export const auth = betterAuth({
  advanced,
  appName: "招聘 AI 协同工作台",
  baseURL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // 开启邮箱+密码登录。注册入口关闭——账号只能通过飞书 OAuth 自动创建，
  // 或由 admin 在「用户管理」里调 setUserPassword 设定登录密码。
  // Email+password sign-in. Public sign-up is disabled — accounts are only
  // created via Feishu OAuth or by admin's setUserPassword from the user-mgmt page.
  emailAndPassword: {
    autoSignIn: true,
    disableSignUp: true,
    enabled: true,
    minPasswordLength: 8,
  },
  // 把 better-auth 内部日志（OAuth state、token 交换、callback 处理等）全部接出到 stdout。
  // 生产环境查 Google 登录失败时，这里能看到 better-auth 是哪一步抛错——
  // 不开就什么都看不到，错误只会以 4xx 返回给浏览器。
  // Pipe better-auth's internal logs (OAuth state, token exchange, callback
  // handling, etc.) to stdout. Without this, Google login failures surface only
  // as opaque 4xx responses; with it, the failing step is visible in prod logs.
  logger: {
    level: "debug",
    log: (level, message, ...args) => {
      let fn: (...a: unknown[]) => void = console.log;
      if (level === "error") {
        fn = console.error;
      } else if (level === "warn") {
        fn = console.warn;
      }
      fn(`[better-auth:${level}]`, message, ...args);
    },
  },
  // 被封禁用户走 OAuth 回调时 better-auth 会重定向到 `${errorURL}?error=banned&...`。
  // 指向 /login —— 那边的 LoginErrorToast 会把 error_description 弹成 toast，
  // 顺手清掉 URL 参数防止刷新重复弹。
  // For OAuth callbacks of banned accounts better-auth redirects to
  // `${errorURL}?error=banned&...`. Point at /login — its LoginErrorToast
  // surfaces the message via toast and strips the params from the URL.
  onAPIError: {
    errorURL: "/login",
  },
  plugins: [
    admin({
      bannedUserMessage: "你的账号已被封禁，请联系管理员。",
    }),
    genericOAuth({
      config: [
        buildFeishuOAuthProvider({
          appId: process.env.FEISHU_APP_ID ?? "",
          appSecret: process.env.FEISHU_APP_SECRET ?? "",
          providerId: "feishu",
        }),
        buildFeishuOAuthProvider({
          appId: process.env.FEISHU_APP_ID2 ?? "",
          appSecret: process.env.FEISHU_APP_SECRET2 ?? "",
          providerId: "feishu-jiguang-hr",
        }),
      ],
    }),
    organization({
      ac,
      roles,
      // 第一期还没有发邀请邮件的通道；先 stub 成 console.log + 让 inviter 自己复制
      // 链接。P2 接邮件后替换。
      // No invitation email channel yet; stub to console.log so inviter can copy the
      // link manually. Wire a real channel in P2.
      sendInvitationEmail({ email, invitation, organization: org }) {
        console.log(
          `[invitation stub] org=${org.name} email=${email} invitationId=${invitation.id}`,
        );
        return Promise.resolve();
      },
    }),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  trustedOrigins,
  user: {
    additionalFields: {
      feishuTenantKey: {
        input: false,
        required: false,
        type: "string",
      },
      feishuTenantName: {
        input: false,
        required: false,
        type: "string",
      },
    },
  },
});
