import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { organization } from "better-auth/plugins/organization";
import { and, eq } from "drizzle-orm";
import * as schema from "@arc/db-schema/schema";
import { ac, roles } from "@arc/shared/permissions";
import type { Database } from "../infrastructure/database/database.tokens.js";
import { configuredFeishuProviders } from "./feishu-oauth.js";
import type { AuthMemberJoinedNotifier } from "./member-joined-notifier.js";
import { OrganizationLifecycle } from "./organization-lifecycle.js";
import { resolveSessionAuthProviderId } from "./session-auth-provider.js";
import { createWorkspaceAuthorizationHook } from "./workspace-auth-hook.js";
import { canAssignWorkspaceRole, isNoAccessWorkspaceRole } from "./workspace-role-policy.js";

export interface BackendAuthEnvironment {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_URL: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_ID2?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_APP_SECRET2?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NODE_ENV: "development" | "production" | "provision" | "test";
  TRUSTED_ORIGINS?: string;
}

const DEFAULT_TRUSTED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
] as const;

function originList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

export function resolveTrustedOrigins(
  environment: Pick<
    BackendAuthEnvironment,
    "BETTER_AUTH_TRUSTED_ORIGINS" | "BETTER_AUTH_URL" | "TRUSTED_ORIGINS"
  >,
): string[] {
  return [
    environment.BETTER_AUTH_URL,
    ...DEFAULT_TRUSTED_ORIGINS,
    ...originList(environment.BETTER_AUTH_TRUSTED_ORIGINS),
    ...originList(environment.TRUSTED_ORIGINS),
  ].filter(
    (origin, index, values): origin is string =>
      Boolean(origin) && values.indexOf(origin) === index,
  );
}

function googleProvider(
  environment: Pick<BackendAuthEnvironment, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">,
) {
  if (Boolean(environment.GOOGLE_CLIENT_ID) !== Boolean(environment.GOOGLE_CLIENT_SECRET)) {
    throw new Error("Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
  return environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: environment.GOOGLE_CLIENT_ID,
          clientSecret: environment.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};
}

export function createBackendAuth(
  database: Database,
  notifier: AuthMemberJoinedNotifier,
  environment: BackendAuthEnvironment,
) {
  const feishuProviders = configuredFeishuProviders(environment);
  const lifecycle = new OrganizationLifecycle(database, notifier);

  return betterAuth({
    advanced:
      environment.NODE_ENV === "production"
        ? { trustedProxyHeaders: true, useSecureCookies: true }
        : undefined,
    appName: "招聘 AI 协同工作台",
    baseURL: environment.BETTER_AUTH_URL,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    databaseHooks: {
      session: {
        create: {
          async after(newSession) {
            try {
              await database
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
    emailAndPassword: {
      autoSignIn: true,
      disableSignUp: true,
      enabled: true,
      minPasswordLength: 8,
    },
    hooks: {
      before: createWorkspaceAuthorizationHook(database),
    },
    onAPIError: { errorURL: "/login" },
    plugins: [
      admin({ bannedUserMessage: "banned" }),
      ...(feishuProviders.length > 0 ? [genericOAuth({ config: feishuProviders })] : []),
      organization({
        ac,
        dynamicAccessControl: { enabled: true },
        organizationHooks: {
          async afterAcceptInvitation({ invitation, member: acceptedMember, user }) {
            if (!isNoAccessWorkspaceRole(acceptedMember.role) && acceptedMember.role === "member") {
              await lifecycle.addMemberToDefaultRecruitingGroup({
                createdBy: invitation.inviterId,
                organizationId: acceptedMember.organizationId,
                userId: user.id,
              });
            }
            await lifecycle.notifyMemberJoined({
              creatorUserId: invitation.inviterId,
              joinedUserId: user.id,
              organizationId: acceptedMember.organizationId,
            });
          },
          async afterCreateOrganization({ organization: createdOrganization, user }) {
            await lifecycle.ensureDefaultRecruitingGroup({
              creatorUserId: user.id,
              organizationId: createdOrganization.id,
            });
          },
          async afterRemoveMember({ member: removed, organization: activeOrganization }) {
            await lifecycle.clearRemovedMemberPreference({
              organizationId: activeOrganization.id,
              userId: removed.userId,
            });
          },
          async beforeCreateInvitation({ invitation, inviter, organization: activeOrganization }) {
            const [invoker] = await database
              .select({ role: schema.member.role })
              .from(schema.member)
              .where(
                and(
                  eq(schema.member.userId, inviter.id),
                  eq(schema.member.organizationId, activeOrganization.id),
                ),
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
                canAssignWorkspaceRole(database, {
                  invokerRole: invoker.role,
                  organizationId: activeOrganization.id,
                  targetRole: role,
                }),
              ),
            );
            if (requestedRoles.length === 0 || allowed.some((isAllowed) => !isAllowed)) {
              throw new APIError("FORBIDDEN", {
                message: "只能邀请为低于自己级别的工作区角色。",
              });
            }
          },
        },
        roles,
        schema: {
          organizationRole: {
            additionalFields: { name: { required: true, type: "string" } },
          },
        },
        sendInvitationEmail({ email, invitation, organization: activeOrganization }) {
          console.info(
            `[invitation stub] org=${activeOrganization.name} email=${email} invitationId=${invitation.id}`,
          );
          return Promise.resolve();
        },
      }),
    ],
    secret: environment.BETTER_AUTH_SECRET,
    session: {
      additionalFields: {
        authProviderId: { input: false, required: false, type: "string" },
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 5,
    },
    socialProviders: googleProvider(environment),
    trustedOrigins: resolveTrustedOrigins(environment),
    user: {
      additionalFields: {
        feishuTenantKey: { input: false, required: false, type: "string" },
        feishuTenantName: { input: false, required: false, type: "string" },
      },
    },
  });
}

export type BackendAuth = ReturnType<typeof createBackendAuth>;
export type BackendAuthSession = BackendAuth["$Infer"]["Session"];
