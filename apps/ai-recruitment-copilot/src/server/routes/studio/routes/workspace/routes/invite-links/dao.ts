import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/server/db";
import { member, user, workspaceInviteLink } from "@arc/db-schema/schema";

// 16 字符 base62 ≈ 95 bit 熵，碰撞概率忽略不计。
const generateCode = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  16,
);

export interface InviteLinkRow {
  id: string;
  code: string;
  organizationId: string;
  createdBy: string | null;
  createdAt: Date;
  disabledAt: Date | null;
  disabledBy: string | null;
}

export interface InviteLinkListRow extends InviteLinkRow {
  creatorName: string | null;
  joinedCount: number;
}

export interface CreateInviteLinkInput {
  organizationId: string;
  createdBy: string;
}

export async function createInviteLink(input: CreateInviteLinkInput): Promise<InviteLinkRow> {
  // 唯一冲突极不可能，但仍然重试一次兜底。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = `wil_${generateCode()}`;
    const code = generateCode();
    try {
      const [row] = await db
        .insert(workspaceInviteLink)
        .values({
          code,
          createdBy: input.createdBy,
          id,
          organizationId: input.organizationId,
        })
        .returning();
      if (row) {
        return row;
      }
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }
  throw new Error("Failed to allocate invite link code after retry");
}

export async function findActiveLinkByCode(code: string): Promise<InviteLinkRow | null> {
  const row = await db.query.workspaceInviteLink.findFirst({
    where: { code, disabledAt: { isNull: true } },
  });
  return row ?? null;
}

export interface DisableInviteLinkInput {
  id: string;
  organizationId: string;
  disabledBy: string;
}

export async function disableInviteLink(
  input: DisableInviteLinkInput,
): Promise<InviteLinkRow | null> {
  // 幂等：已禁用直接读出来返回，不更新。
  const existing = await db.query.workspaceInviteLink.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) {
    return null;
  }
  if (existing.disabledAt) {
    return existing;
  }
  const [row] = await db
    .update(workspaceInviteLink)
    .set({ disabledAt: new Date(), disabledBy: input.disabledBy })
    .where(
      and(
        eq(workspaceInviteLink.id, input.id),
        eq(workspaceInviteLink.organizationId, input.organizationId),
        isNull(workspaceInviteLink.disabledAt),
      ),
    )
    .returning();
  return row ?? existing;
}

export interface EnableInviteLinkInput {
  id: string;
  organizationId: string;
}

export async function enableInviteLink(
  input: EnableInviteLinkInput,
): Promise<InviteLinkRow | null> {
  // 幂等：未禁用直接读出来返回，不更新。
  const existing = await db.query.workspaceInviteLink.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) {
    return null;
  }
  if (!existing.disabledAt) {
    return existing;
  }
  const [row] = await db
    .update(workspaceInviteLink)
    .set({ disabledAt: null, disabledBy: null })
    .where(
      and(
        eq(workspaceInviteLink.id, input.id),
        eq(workspaceInviteLink.organizationId, input.organizationId),
      ),
    )
    .returning();
  return row ?? existing;
}

export async function listInviteLinks(organizationId: string): Promise<InviteLinkListRow[]> {
  const rows = await db
    .select({
      code: workspaceInviteLink.code,
      createdAt: workspaceInviteLink.createdAt,
      createdBy: workspaceInviteLink.createdBy,
      creatorName: user.name,
      disabledAt: workspaceInviteLink.disabledAt,
      disabledBy: workspaceInviteLink.disabledBy,
      id: workspaceInviteLink.id,
      joinedCount: sql<number>`COUNT(${member.id})::int`.as("joined_count"),
      organizationId: workspaceInviteLink.organizationId,
    })
    .from(workspaceInviteLink)
    .leftJoin(member, eq(member.inviteLinkId, workspaceInviteLink.id))
    .leftJoin(user, eq(user.id, workspaceInviteLink.createdBy))
    .where(eq(workspaceInviteLink.organizationId, organizationId))
    .groupBy(workspaceInviteLink.id, user.name)
    .orderBy(desc(workspaceInviteLink.createdAt));
  return rows;
}

export interface LinkMemberRow {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
}

export async function listLinkMembers(input: {
  id: string;
  organizationId: string;
}): Promise<LinkMemberRow[]> {
  const rows = await db
    .select({
      email: user.email,
      joinedAt: member.createdAt,
      name: user.name,
      userId: user.id,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, input.organizationId), eq(member.inviteLinkId, input.id)))
    .orderBy(desc(member.createdAt));
  return rows;
}
