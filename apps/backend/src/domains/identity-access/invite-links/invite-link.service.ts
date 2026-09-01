import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { member, organizationRole, user, workspaceInviteLink } from "@arc/db-schema/schema";
import { customAlphabet } from "nanoid";
import { Resend } from "resend";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";

function roleRank(role: string) {
  if (role === "owner") {
    return 3;
  }
  if (role === "admin") {
    return 2;
  }
  if (role === "member") {
    return 1;
  }
  if (role === "noAccess") {
    return 0;
  }
}
const generateCode = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  16,
);

function serialize<T extends { createdAt: Date; disabledAt: Date | null }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString() ?? null,
  };
}

@Injectable()
export class InviteLinkService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  private async canAssign(organizationId: string, invokerRole: string, targetRole: string) {
    const targetRank = roleRank(targetRole);
    const invokerRank = roleRank(invokerRole);
    if (targetRank !== undefined) {
      return invokerRank !== undefined && invokerRank > targetRank;
    }
    const target = await this.database
      .select({ id: organizationRole.id })
      .from(organizationRole)
      .where(
        and(
          eq(organizationRole.organizationId, organizationId),
          eq(organizationRole.role, targetRole),
        ),
      )
      .limit(1);
    if (!target[0]) {
      return false;
    }
    if (invokerRole === "owner" || invokerRole === "admin") {
      return true;
    }
    if (invokerRank !== undefined) {
      return false;
    }
    const invoker = await this.database
      .select({ id: organizationRole.id })
      .from(organizationRole)
      .where(
        and(
          eq(organizationRole.organizationId, organizationId),
          eq(organizationRole.role, invokerRole),
        ),
      )
      .limit(1);
    return Boolean(invoker[0]);
  }

  private async sendInvitation(input: {
    code: string;
    email: string;
    id: string;
    inviterName: string;
    workspaceName: string;
  }) {
    const apiKey = rawBackendEnvironment.RESEND_API_KEY;
    const fromValue = rawBackendEnvironment.RESEND_FROM;
    const baseUrl =
      rawBackendEnvironment.NEXT_PUBLIC_BASE_URL?.trim() ||
      rawBackendEnvironment.BETTER_AUTH_URL?.trim();
    if (!(apiKey && fromValue && baseUrl)) {
      throw new Error("邀请邮件配置不完整");
    }
    const address = fromValue.match(/<([^>]+)>/)?.[1]?.trim() ?? fromValue.trim();
    const from = `${input.workspaceName.trim() || "AI HR"} AI HR <${address}>`;
    const invitationUrl = `${baseUrl.replace(/\/$/, "")}/join/${encodeURIComponent(input.code)}`;
    const inviterName = input.inviterName.trim() || "工作区管理员";
    const subject = `${inviterName} 邀请你加入 ${input.workspaceName}`;
    const text = `${inviterName} 邀请你加入 ${input.workspaceName}。请打开邀请链接并使用飞书登录：${invitationUrl}`;
    const result = await new Resend(apiKey).emails.send(
      { from, subject, text, to: input.email },
      { idempotencyKey: `workspace-invite-link:${input.id}:${input.email}` },
    );
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "邮件供应商未返回消息 ID");
    }
  }

  async create(input: {
    actorId: string;
    actorName: string;
    email?: string;
    initialRole: string;
    invokerRole: string;
    organizationId: string;
    workspaceName: string;
  }) {
    if (!(await this.canAssign(input.organizationId, input.invokerRole, input.initialRole))) {
      throw new ForbiddenException("只能设置为可分配的工作区角色。", {
        errorCode: "INVITE_LINK_ROLE_FORBIDDEN",
      });
    }
    let created: typeof workspaceInviteLink.$inferSelect | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const rows = await this.database
          .insert(workspaceInviteLink)
          .values({
            code: generateCode(),
            createdBy: input.actorId,
            id: `wil_${generateCode()}`,
            initialRole: input.initialRole,
            organizationId: input.organizationId,
          })
          .returning();
        [created] = rows;
        if (created) {
          break;
        }
      } catch (error) {
        if (attempt === 1) {
          throw error;
        }
      }
    }
    if (!created) {
      throw new Error("Failed to allocate invite link code after retry");
    }
    let emailDelivery: "failed" | "not_requested" | "sent" = "not_requested";
    if (input.email) {
      try {
        await this.sendInvitation({
          code: created.code,
          email: input.email,
          id: created.id,
          inviterName: input.actorName,
          workspaceName: input.workspaceName,
        });
        emailDelivery = "sent";
      } catch {
        emailDelivery = "failed";
      }
    }
    return { ...serialize(created), emailDelivery };
  }

  async list(organizationId: string) {
    const rows = await this.database
      .select({
        code: workspaceInviteLink.code,
        createdAt: workspaceInviteLink.createdAt,
        createdBy: workspaceInviteLink.createdBy,
        creatorName: user.name,
        disabledAt: workspaceInviteLink.disabledAt,
        disabledBy: workspaceInviteLink.disabledBy,
        id: workspaceInviteLink.id,
        initialRole: workspaceInviteLink.initialRole,
        joinedCount: sql<number>`COUNT(${member.id})::int`,
        organizationId: workspaceInviteLink.organizationId,
      })
      .from(workspaceInviteLink)
      .leftJoin(member, eq(member.inviteLinkId, workspaceInviteLink.id))
      .leftJoin(user, eq(user.id, workspaceInviteLink.createdBy))
      .where(eq(workspaceInviteLink.organizationId, organizationId))
      .groupBy(workspaceInviteLink.id, user.name)
      .orderBy(desc(workspaceInviteLink.createdAt));
    return { links: rows.map(serialize) };
  }

  async updateRole(organizationId: string, invokerRole: string, id: string, initialRole: string) {
    if (!(await this.canAssign(organizationId, invokerRole, initialRole))) {
      throw new ForbiddenException("只能设置为可分配的工作区角色。", {
        errorCode: "INVITE_LINK_ROLE_FORBIDDEN",
      });
    }
    const rows = await this.database
      .update(workspaceInviteLink)
      .set({ initialRole })
      .where(
        and(eq(workspaceInviteLink.id, id), eq(workspaceInviteLink.organizationId, organizationId)),
      )
      .returning();
    if (!rows[0]) {
      throw new NotFoundException("链接不存在或不属于当前工作区。", {
        errorCode: "INVITE_LINK_NOT_FOUND",
      });
    }
    return serialize(rows[0]);
  }

  private async get(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(workspaceInviteLink)
      .where(
        and(eq(workspaceInviteLink.id, id), eq(workspaceInviteLink.organizationId, organizationId)),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("链接不存在或不属于当前工作区。", {
        errorCode: "INVITE_LINK_NOT_FOUND",
      });
    }
    return rows[0];
  }

  async disable(organizationId: string, actorId: string, id: string) {
    const existing = await this.get(organizationId, id);
    if (existing.disabledAt) {
      return serialize(existing);
    }
    const rows = await this.database
      .update(workspaceInviteLink)
      .set({ disabledAt: new Date(), disabledBy: actorId })
      .where(
        and(
          eq(workspaceInviteLink.id, id),
          eq(workspaceInviteLink.organizationId, organizationId),
          isNull(workspaceInviteLink.disabledAt),
        ),
      )
      .returning();
    return serialize(rows[0] ?? existing);
  }

  async enable(organizationId: string, id: string) {
    const existing = await this.get(organizationId, id);
    if (!existing.disabledAt) {
      return serialize(existing);
    }
    const rows = await this.database
      .update(workspaceInviteLink)
      .set({ disabledAt: null, disabledBy: null })
      .where(
        and(eq(workspaceInviteLink.id, id), eq(workspaceInviteLink.organizationId, organizationId)),
      )
      .returning();
    return serialize(rows[0] ?? existing);
  }

  async members(organizationId: string, id: string) {
    const rows = await this.database
      .select({ email: user.email, joinedAt: member.createdAt, name: user.name, userId: user.id })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, organizationId), eq(member.inviteLinkId, id)))
      .orderBy(desc(member.createdAt));
    return { members: rows.map((row) => ({ ...row, joinedAt: row.joinedAt.toISOString() })) };
  }
}
