import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { organization } from "better-auth/plugins/organization";
import { and, eq } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { getAuthRequestHeaders } from "./auth-request-context";
import { getRequiredEnv } from "./env";
import { getFeishuTenantAccessToken } from "./feishu-access-token";
import { resolveSessionAuthProviderId } from "./session-auth-provider";
import {
  canAssignWorkspaceRole,
  dynamicWorkspaceRoleExists,
  isNoAccessWorkspaceRole,
} from "../../server/access/workspace-roles";
import {
  addMemberToDefaultRecruitingGroup,
  ensureDefaultRecruitingGroupForWorkspace,
} from "../../server/routes/studio/routes/workspace/dao";
import { notifyWorkspaceInviteCreatorMemberJoinedSafely } from "../../server/routes/studio/routes/workspace/utils/workspace-member-joined-notification";
import { ac, roles } from "@arc/shared/permissions";
import { db } from "./db";
import * as schema from "@arc/db-schema/schema";

const baseURL = getRequiredEnv("BETTER_AUTH_URL");

/**
 * Default trusted origins when `BETTER_AUTH_TRUSTED_ORIGINS` is unset.
 * Always merged in so local web + desktop OAuth work without extra env.
 * Extend (never replace) via BETTER_AUTH_TRUSTED_ORIGINS or TRUSTED_ORIGINS.
 *
 * - localhost:3000 — web / BETTER_AUTH_URL in local monorepo
 * - localhost:5173/5174 — electron-vite desktop renderer (OAuth callback origin)
 */
const DEFAULT_BETTER_AUTH_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
] as const;

function parseOriginList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

// Prefer BETTER_AUTH_TRUSTED_ORIGINS (better-auth convention); TRUSTED_ORIGINS
// is a project alias. Both extend the built-in defaults rather than replacing them.
// Exported so Hono CORS on /api/* can share the same allow-list as better-auth
// (desktop Electron at localhost:5173 needs credentials CORS for studio RPCs).
export const trustedOrigins = uniq([
  baseURL,
  ...DEFAULT_BETTER_AUTH_TRUSTED_ORIGINS,
  ...parseOriginList(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  ...parseOriginList(process.env.TRUSTED_ORIGINS),
]);

function pickFirstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((value): value is string => value !== undefined && value.length > 0);
}

function isBuiltInAdminAssignableRole(role: string): boolean {
  return role === "member" || isNoAccessWorkspaceRole(role);
}

function isBuiltInOwnerAssignableRole(role: string): boolean {
  return role === "admin" || isBuiltInAdminAssignableRole(role);
}

async function canAdminSetRole(organizationId: string, role: string): Promise<boolean> {
  return (
    isBuiltInAdminAssignableRole(role) || (await dynamicWorkspaceRoleExists(organizationId, role))
  );
}

async function canOwnerSetRole(organizationId: string, role: string): Promise<boolean> {
  return (
    isBuiltInOwnerAssignableRole(role) || (await dynamicWorkspaceRoleExists(organizationId, role))
  );
}

const feishuTenantQueryResponseSchema = z.object({
  code: z.number(),
  data: z.object({ tenant: z.object({ name: z.string().optional() }).optional() }).optional(),
  msg: z.string().optional(),
});
const feishuTokenResponseSchema = z.object({
  access_token: z.string().optional(),
  code: z.number().optional(),
  expires_in: z.number().optional(),
  msg: z.string().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
const feishuUserInfoResponseSchema = z.object({
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

async function fetchFeishuOrganizationName(
  appId: string,
  appSecret: string,
): Promise<string | null> {
  try {
    const token = await getFeishuTenantAccessToken(appId, appSecret);
    const res = await fetch("https://open.feishu.cn/open-apis/tenant/v2/tenant/query", {
      headers: { authorization: `Bearer ${token}` },
    });
    const json = feishuTenantQueryResponseSchema.parse(await res.json());
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
    accountIssuer: `local:oauth:${encodeURIComponent(providerId)}`,
    accountSubject: ({ profile }) => {
      if (profile.id === null || profile.id === undefined || profile.id === "") {
        throw new Error(`Feishu provider ${providerId} returned no stable account id.`);
      }
      return profile.id;
    },
    clientId: appId,
    clientSecret: appSecret,
    authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
    // Required by the plugin's config validation, but not actually called —
    // `getToken` below handles the JSON-only v2 token exchange.
    tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
    // Preserve Feishu's existing v2 exchange contract, which has no
    // code_verifier field.
    pkce: false,
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
      const json = feishuTokenResponseSchema.parse(await res.json());
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
        raw: z.record(z.string(), z.json()).parse(json),
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
      const json = feishuUserInfoResponseSchema.parse(await userInfoRes.json());
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
  // 登录时只更新时间偏好；工作区权限上下文永远由具体请求 URL 决定。
  // Login only updates durable activity metadata. Workspace authorization is
  // always derived from the current request URL.
  databaseHooks: {
    session: {
      create: {
        // oxlint-disable-next-line require-await -- hook contract requires async
        async after(newSession) {
          // user.lastActiveAt survives logout / session expiry and is only
          // operational metadata, never an authorization input.
          try {
            await db
              .update(schema.user)
              .set({ lastActiveAt: newSession.createdAt ?? new Date() })
              .where(eq(schema.user.id, newSession.userId));
          } catch (error) {
            console.warn("[auth] failed to stamp user.lastActiveAt", error);
          }
        },
        before(newSession, context) {
          const authProviderId = resolveSessionAuthProviderId(context);
          return Promise.resolve({
            data: authProviderId ? { ...newSession, authProviderId } : newSession,
          });
        },
      },
    },
  },
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
      // Better Auth currently interpolates this value into the OAuth redirect
      // Location header without URL encoding. Keep it ASCII-safe and translate
      // the marker on the frontend.
      bannedUserMessage: "banned",
    }),
    genericOAuth({
      config: [
        buildFeishuOAuthProvider({
          appId: getRequiredEnv("FEISHU_APP_ID"),
          appSecret: getRequiredEnv("FEISHU_APP_SECRET"),
          providerId: "feishu",
        }),
        buildFeishuOAuthProvider({
          appId: getRequiredEnv("FEISHU_APP_ID2"),
          appSecret: getRequiredEnv("FEISHU_APP_SECRET2"),
          providerId: "feishu-jiguang-hr",
        }),
      ],
    }),
    organization({
      ac,
      dynamicAccessControl: {
        enabled: true,
      },
      // 服务端硬约束：只有 owner/admin 可以调整工作区级角色；admin 不能调整
      // owner/admin 或自己的角色。owner 角色本身的转让仍由 better-auth 内置
      // transferOwnership 单独处理。
      //
      // Server-side gate: only owner/admin can update workspace-level roles;
      // admin cannot edit owner/admin or itself. Ownership transfer remains a
      // separate better-auth flow.
      organizationHooks: {
        afterAcceptInvitation: async ({ invitation, member: acceptedMember, user }) => {
          if (!isNoAccessWorkspaceRole(acceptedMember.role) && acceptedMember.role === "member") {
            await addMemberToDefaultRecruitingGroup({
              createdBy: invitation.inviterId,
              organizationId: acceptedMember.organizationId,
              userId: user.id,
            });
          }
          await notifyWorkspaceInviteCreatorMemberJoinedSafely({
            creatorUserId: invitation.inviterId,
            joinedUserId: user.id,
            organizationId: acceptedMember.organizationId,
          });
        },
        afterCreateOrganization: async ({ organization: org, user }) => {
          await ensureDefaultRecruitingGroupForWorkspace({
            creatorUserId: user.id,
            organizationId: org.id,
          });
        },
        // Clear only the durable landing preference. The member row remains
        // the authorization source, so no session-wide tenant mutation is needed.
        afterRemoveMember: async ({ member: removed, organization: org }) => {
          try {
            await db
              .update(schema.user)
              .set({ lastActiveOrganizationId: null })
              .where(
                and(
                  eq(schema.user.id, removed.userId),
                  eq(schema.user.lastActiveOrganizationId, org.id),
                ),
              );
          } catch (error) {
            console.warn("[auth] failed to clear stale workspace preference", error);
          }
        },
        beforeCreateInvitation: async ({ invitation, inviter, organization: org }) => {
          const [invoker] = await db
            .select({ role: schema.member.role })
            .from(schema.member)
            .where(
              and(eq(schema.member.userId, inviter.id), eq(schema.member.organizationId, org.id)),
            )
            .limit(1);

          if (!invoker) {
            throw new APIError("FORBIDDEN", { message: "你不在这个工作区中。" });
          }

          const requestedRoles = invitation.role
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);
          const allowed = await Promise.all(
            requestedRoles.map((role) =>
              canAssignWorkspaceRole({
                invokerRole: invoker.role,
                organizationId: org.id,
                targetRole: role,
              }),
            ),
          );
          if (requestedRoles.length === 0 || allowed.some((ok) => !ok)) {
            throw new APIError("FORBIDDEN", {
              message: "只能邀请为低于自己级别的工作区角色。",
            });
          }
        },
        beforeUpdateMemberRole: async ({ member: targetMember, newRole, organization: org }) => {
          // ⚠️ 注意：better-auth 这里的 `user` 参数实际是 **目标用户**（被改的人），
          // 不是触发请求的人——文档跟实现不一致，源码里写的是
          // `user: userBeingUpdated`（见 better-auth crud-members.mjs:283）。
          // 所以这里完全不用 `user`，而是从当前 auth 请求上下文拿 headers，再用
          // auth.api.getSession 拿到真正的 invoker。
          //
          // CAUTION: better-auth's `user` arg here is the TARGET user, not the
          // caller (the docs are wrong; source assigns `user: userBeingUpdated`).
          // Skip it entirely and pull the real invoker from the session.
          const authRequestHeaders = getAuthRequestHeaders();
          if (!authRequestHeaders) {
            throw new APIError("UNAUTHORIZED", { message: "未登录。" });
          }
          const session = await auth.api.getSession({ headers: authRequestHeaders });
          const invokerUserId = session?.user?.id;
          if (!invokerUserId) {
            throw new APIError("UNAUTHORIZED", { message: "未登录。" });
          }
          const [invoker] = await db
            .select({ role: schema.member.role, userId: schema.member.userId })
            .from(schema.member)
            .where(
              and(
                eq(schema.member.userId, invokerUserId),
                eq(schema.member.organizationId, org.id),
              ),
            )
            .limit(1);

          if (!invoker) {
            throw new APIError("FORBIDDEN", { message: "你不在这个工作区中。" });
          }

          if (!(invoker.role === "owner" || invoker.role === "admin")) {
            throw new APIError("FORBIDDEN", { message: "只有管理员可以调整工作区角色。" });
          }

          const nextRole = Array.isArray(newRole) ? newRole[0] : newRole;
          if (!nextRole) {
            throw new APIError("FORBIDDEN", {
              message: "请选择有效的工作区角色。",
            });
          }

          if (invoker.role === "admin") {
            if (targetMember.userId === invoker.userId) {
              throw new APIError("FORBIDDEN", { message: "管理员不能调整自己的角色。" });
            }
            if (targetMember.role === "owner" || targetMember.role === "admin") {
              throw new APIError("FORBIDDEN", { message: "管理员不能调整拥有者或管理员。" });
            }
            if (!(await canAdminSetRole(org.id, nextRole))) {
              throw new APIError("FORBIDDEN", {
                message: "只能设置为普通成员、空权限用户或自定义角色。",
              });
            }
            return;
          }

          if (!(await canOwnerSetRole(org.id, nextRole))) {
            throw new APIError("FORBIDDEN", {
              message: "只能设置为管理员、普通成员、空权限用户或自定义角色。",
            });
          }
        },
      },
      roles,
      schema: {
        organizationRole: {
          additionalFields: {
            name: {
              required: true,
              type: "string",
            },
          },
        },
      },
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
  // 显式声明 session 寿命 & 刷新间隔。默认 expiresIn=7d / updateAge=1d，
  // 但 1 天的 updateAge 意味着 session.updatedAt 一天内顶多动一次——会让
  // 「最近活跃」列分辨率降到 1 天。这里调到 5 分钟，DB 写频可控、用户体感
  // 接近实时；expiresIn 维持 7 天。
  // Explicit session lifetimes. Default updateAge=1d makes session.updatedAt
  // bump at most once per day, which caps the "last active" column resolution
  // at 1 day. 5 minutes is a balanced trade between DB write frequency and
  // perceived freshness; expiresIn stays at 7 days.
  session: {
    additionalFields: {
      authProviderId: {
        input: false,
        required: false,
        type: "string",
      },
    },
    // 7 天 = 60 * 60 * 24 * 7
    expiresIn: 60 * 60 * 24 * 7,
    // 5 分钟 = 60 * 5；让"最近活跃"列足够新鲜
    updateAge: 60 * 5,
  },
  socialProviders: {
    google: {
      clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
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
