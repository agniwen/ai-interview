import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { member } from "@arc/db-schema/schema";
import type { Database } from "../infrastructure/database/database.tokens.js";
import { canAdminSetRole, canOwnerSetRole } from "./workspace-role-policy.js";

const updateMemberRoleBodySchema = z.object({
  memberId: z.string().min(1),
  organizationId: z.string().min(1).optional(),
  role: z.union([z.string(), z.array(z.string())]),
});

function normalizedRoles(role: string | string[]): string[] {
  return (Array.isArray(role) ? role : [role])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createWorkspaceAuthorizationHook(database: Database) {
  // Better Auth's organization hook exposes the target user, not the caller.
  // Its global request hook retains explicit headers, so resolve an authoritative
  // session here instead of introducing ambient/request-scoped state.
  return createAuthMiddleware(async (context) => {
    if (context.path !== "/organization/update-member-role") {
      return;
    }
    const body = updateMemberRoleBodySchema.safeParse(context.body);
    if (!body.success) {
      return;
    }
    const session = await getSessionFromCtx(context, { disableCookieCache: true });
    if (!session?.user.id) {
      throw new APIError("UNAUTHORIZED", { message: "未登录。" });
    }
    const activeOrganizationId = z.string().safeParse(session.session.activeOrganizationId);
    const organizationId =
      body.data.organizationId || (activeOrganizationId.success ? activeOrganizationId.data : null);
    if (!organizationId) {
      throw new APIError("BAD_REQUEST", { message: "请选择工作区。" });
    }
    const [invoker, targetMember] = await Promise.all([
      database
        .select({ id: member.id, role: member.role, userId: member.userId })
        .from(member)
        .where(and(eq(member.userId, session.user.id), eq(member.organizationId, organizationId)))
        .limit(1)
        .then((rows) => rows[0]),
      database
        .select({ organizationId: member.organizationId, role: member.role, userId: member.userId })
        .from(member)
        .where(eq(member.id, body.data.memberId))
        .limit(1)
        .then((rows) => rows[0]),
    ]);
    if (!invoker) {
      throw new APIError("FORBIDDEN", { message: "你不在这个工作区中。" });
    }
    if (!targetMember || targetMember.organizationId !== organizationId) {
      throw new APIError("FORBIDDEN", { message: "不能调整其他工作区的成员。" });
    }
    if (!(invoker.role === "owner" || invoker.role === "admin")) {
      throw new APIError("FORBIDDEN", { message: "只有管理员可以调整工作区角色。" });
    }
    const roles = normalizedRoles(body.data.role);
    if (roles.length !== 1) {
      throw new APIError("FORBIDDEN", { message: "请选择一个有效的工作区角色。" });
    }
    const [nextRole] = roles;
    if (invoker.role === "admin") {
      if (targetMember.userId === invoker.userId) {
        throw new APIError("FORBIDDEN", { message: "管理员不能调整自己的角色。" });
      }
      if (targetMember.role === "owner" || targetMember.role === "admin") {
        throw new APIError("FORBIDDEN", { message: "管理员不能调整拥有者或管理员。" });
      }
      if (!(await canAdminSetRole(database, organizationId, nextRole))) {
        throw new APIError("FORBIDDEN", {
          message: "只能设置为普通成员、空权限用户或自定义角色。",
        });
      }
      return;
    }
    if (!(await canOwnerSetRole(database, organizationId, nextRole))) {
      throw new APIError("FORBIDDEN", {
        message: "只能设置为管理员、普通成员、空权限用户或自定义角色。",
      });
    }
  });
}
