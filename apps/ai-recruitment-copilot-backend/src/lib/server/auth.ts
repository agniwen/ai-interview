import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { organization } from "better-auth/plugins/organization";
import { and, eq } from "drizzle-orm";
import { uniq } from "lodash-es";
import { getAuthRequestHeaders } from "@arc/ai-recruitment-copilot-backend/lib/server/auth-request-context";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import {
  canAssignWorkspaceRole,
  dynamicWorkspaceRoleExists,
  isNoAccessWorkspaceRole,
} from "@arc/ai-recruitment-copilot-backend/server/access/workspace-roles";
import {
  addMemberToDefaultRecruitingGroup,
  ensureDefaultRecruitingGroupForWorkspace,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/workspace/dao";
import { ac, roles } from "@arc/shared/permissions";
import { db } from "./db";
import * as schema from "@arc/db-schema/schema";

const baseURL = getRequiredEnv("BETTER_AUTH_URL");
const trustedOrigins = uniq([baseURL, "http://localhost:3000"]);

function pickFirstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => typeof v === "string" && v.length > 0);
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
  // 新 session 创建后（即登录完成时）把 session.activeOrganizationId 还原成
  // user.lastActiveOrganizationId —— 让"切到 B → 退出 → 重新登录"还落到 B，
  // 而不是回到默认 fallback。校验：用户仍然是该 org 的 member 才生效，避免
  // user 被踢出 org 后 session 还指着它。
  // After a new session is created (= login completes), restore the
  // session.activeOrganizationId from user.lastActiveOrganizationId so users
  // land back on the workspace they last visited rather than the default
  // fallback. Verified against current membership so a kicked-out user
  // doesn't land in an org they no longer belong to.
  databaseHooks: {
    session: {
      create: {
        // oxlint-disable-next-line require-await -- hook contract requires async
        async after(newSession) {
          // 顺便刷新 user.lastActiveAt——这是"最近活跃"列的持久化兜底，session
          // 行后续被登出/过期清理后仍能展示"该用户最后出现的时间"。失败不致命，
          // 仅记日志，不影响 active-org 还原主流程。
          // Update user.lastActiveAt alongside the org-restore work. This is the
          // durable "last active" anchor that survives logout / expiry cleanup
          // of session rows. Failure is non-fatal — log and continue so the
          // org-restore path below still runs.
          try {
            await db
              .update(schema.user)
              .set({ lastActiveAt: newSession.createdAt ?? new Date() })
              .where(eq(schema.user.id, newSession.userId));
          } catch (error) {
            console.warn("[auth] failed to stamp user.lastActiveAt", error);
          }

          try {
            const [u] = await db
              .select({ lastActive: schema.user.lastActiveOrganizationId })
              .from(schema.user)
              .where(eq(schema.user.id, newSession.userId))
              .limit(1);
            if (!u?.lastActive) {
              return;
            }
            // 再验一次成员关系才回填，避免被踢出后仍试图落到老 org。
            // 失效的话主动把 user.lastActiveOrganizationId 清成 null —— 配合
            // resolveActiveOrganization 不再 fallback 到 orgs[0]，登录后会被
            // 引导到 /select-workspace 让用户明确选择新工作区。
            //
            // Re-verify membership so a kicked-out user can't be sent back.
            // When membership is gone, proactively null out the stale pointer
            // so the next page render flows to /select-workspace (the resolver
            // no longer falls back to orgs[0]).
            const [m] = await db
              .select({ id: schema.member.id })
              .from(schema.member)
              .where(
                and(
                  eq(schema.member.userId, newSession.userId),
                  eq(schema.member.organizationId, u.lastActive),
                ),
              )
              .limit(1);
            if (!m) {
              await db
                .update(schema.user)
                .set({ lastActiveOrganizationId: null })
                .where(eq(schema.user.id, newSession.userId));
              return;
            }
            await db
              .update(schema.session)
              .set({ activeOrganizationId: u.lastActive })
              .where(eq(schema.session.id, newSession.id));
          } catch (error) {
            // 还原失败不影响登录主流程；最多回退到默认 org 的旧行为。
            // Restore failure must not block login; worst case is the prior
            // "default org" behaviour.
            console.warn("[auth] failed to restore lastActiveOrganizationId", error);
          }
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
      bannedUserMessage: "你的账号已被封禁，请联系管理员。",
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
          if (isNoAccessWorkspaceRole(acceptedMember.role) || acceptedMember.role !== "member") {
            return;
          }
          await addMemberToDefaultRecruitingGroup({
            createdBy: invitation.inviterId,
            organizationId: acceptedMember.organizationId,
            userId: user.id,
          });
        },
        afterCreateOrganization: async ({ organization: org, user }) => {
          await ensureDefaultRecruitingGroupForWorkspace({
            creatorUserId: user.id,
            organizationId: org.id,
          });
        },
        // 成员被移除后：清掉该用户名下 session.activeOrganizationId 仍指向这个 org 的
        // 记录，让他们下一次请求被 workspaceMiddleware 拒之门外（成员表已经没他）。
        // 不删 session 行——用户可能还属于其他 workspace，删了等于把所有 workspace
        // 一起强制下线。activeOrganizationId 设为 null 即可，下次访问会被引导到
        // /select-workspace，那边的 resolver 自然过滤掉无 membership 的 org。
        //
        // Clear session.activeOrganizationId for the removed user where it
        // still points at this org. Their next request will fail the
        // workspace-membership middleware and bounce to /select-workspace.
        // We don't delete session rows because the user may belong to other
        // workspaces; nulling the active pointer is the minimum effective fix.
        afterRemoveMember: async ({ member: removed, organization: org }) => {
          try {
            await db
              .update(schema.session)
              .set({ activeOrganizationId: null })
              .where(
                and(
                  eq(schema.session.userId, removed.userId),
                  eq(schema.session.activeOrganizationId, org.id),
                ),
              );
          } catch (error) {
            // 清理失败不影响移除主流程；最差情况是用户下一次请求看到 stale
            // active-org，middleware 仍会因为没 membership 拒绝。
            // Cleanup failure is non-fatal; middleware still blocks access.
            console.warn("[auth] failed to clear stale session.activeOrg", error);
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
