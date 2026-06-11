import { and, asc, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  member,
  recruitingGroup,
  recruitingGroupMember,
  session,
  user,
} from "@arc/db-schema/schema";

export const DEFAULT_RECRUITING_GROUP_NAME = "默认招聘组";
export const UNGROUPED_RECRUITING_GROUP_ID = "__ungrouped__";

export type RecruitingGroupRole = "recruitingSupervisor" | "recruitingLead" | "hr" | "viewer";

export interface RecruitingGroupMemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: RecruitingGroupRole | null;
}

export interface RecruitingGroupBoardRow {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
  isVirtual?: boolean;
  members: RecruitingGroupMemberRow[];
  memberUserIds: string[];
}

// 给「面试官多选」用的精简 member DTO。
// Lightweight member DTO for interviewer multi-select pickers.
export interface WorkspaceMemberRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export async function listWorkspaceMembers(organizationId: string): Promise<WorkspaceMemberRow[]> {
  const rows = await db
    .select({
      email: user.email,
      id: user.id,
      image: user.image,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(user.name));
  return rows.map((row) => ({
    email: row.email,
    id: row.id,
    image: row.image,
    name: row.name ?? "未命名",
  }));
}

export function ensureDefaultRecruitingGroupForWorkspace({
  creatorUserId,
  organizationId,
}: {
  creatorUserId: string | null | undefined;
  organizationId: string;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        createdAt: recruitingGroup.createdAt,
        id: recruitingGroup.id,
        isDefault: recruitingGroup.isDefault,
        name: recruitingGroup.name,
      })
      .from(recruitingGroup)
      .where(
        and(
          eq(recruitingGroup.organizationId, organizationId),
          eq(recruitingGroup.isDefault, true),
        ),
      )
      .limit(1);

    const inserted = existing
      ? []
      : await tx
          .insert(recruitingGroup)
          .values({
            createdBy: creatorUserId ?? null,
            id: crypto.randomUUID(),
            isDefault: true,
            name: DEFAULT_RECRUITING_GROUP_NAME,
            organizationId,
          })
          .onConflictDoNothing({
            target: recruitingGroup.organizationId,
            where: sql`${recruitingGroup.isDefault} = true`,
          })
          .returning({
            createdAt: recruitingGroup.createdAt,
            id: recruitingGroup.id,
            isDefault: recruitingGroup.isDefault,
            name: recruitingGroup.name,
          });
    const group = existing ?? inserted[0];

    const fallback = group
      ? []
      : await tx
          .select({
            createdAt: recruitingGroup.createdAt,
            id: recruitingGroup.id,
            isDefault: recruitingGroup.isDefault,
            name: recruitingGroup.name,
          })
          .from(recruitingGroup)
          .where(
            and(
              eq(recruitingGroup.organizationId, organizationId),
              eq(recruitingGroup.isDefault, true),
            ),
          )
          .limit(1);
    const resolvedGroup = group ?? fallback[0];

    if (!resolvedGroup) {
      throw new Error("Failed to ensure default recruiting group.");
    }

    if (!creatorUserId) {
      return { ...resolvedGroup, createdAt: resolvedGroup.createdAt.toISOString() };
    }

    const [targetMember] = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, creatorUserId)))
      .limit(1);

    if (targetMember) {
      await tx
        .insert(recruitingGroupMember)
        .values({
          createdBy: creatorUserId,
          groupId: resolvedGroup.id,
          id: crypto.randomUUID(),
          organizationId,
          role: "recruitingSupervisor",
          userId: creatorUserId,
        })
        .onConflictDoNothing({
          target: [
            recruitingGroupMember.organizationId,
            recruitingGroupMember.groupId,
            recruitingGroupMember.userId,
          ],
        });
    }

    return { ...resolvedGroup, createdAt: resolvedGroup.createdAt.toISOString() };
  });
}

export async function listRecruitingGroupBoard(
  organizationId: string,
): Promise<RecruitingGroupBoardRow[]> {
  const [rows, ungroupedRows] = await Promise.all([
    db
      .select({
        groupCreatedAt: recruitingGroup.createdAt,
        groupId: recruitingGroup.id,
        groupIsDefault: recruitingGroup.isDefault,
        groupName: recruitingGroup.name,
        memberEmail: user.email,
        memberId: recruitingGroupMember.id,
        memberImage: user.image,
        memberName: user.name,
        memberRole: recruitingGroupMember.role,
        memberUserId: recruitingGroupMember.userId,
      })
      .from(recruitingGroup)
      .leftJoin(
        recruitingGroupMember,
        and(
          eq(recruitingGroupMember.organizationId, recruitingGroup.organizationId),
          eq(recruitingGroupMember.groupId, recruitingGroup.id),
        ),
      )
      .leftJoin(user, eq(user.id, recruitingGroupMember.userId))
      .where(eq(recruitingGroup.organizationId, organizationId))
      .orderBy(desc(recruitingGroup.isDefault), asc(recruitingGroup.createdAt), asc(user.name)),
    db
      .select({
        email: user.email,
        image: user.image,
        name: user.name,
        userId: member.userId,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(member.organizationId, organizationId),
          notExists(
            db
              .select({ id: recruitingGroupMember.id })
              .from(recruitingGroupMember)
              .where(
                and(
                  eq(recruitingGroupMember.organizationId, member.organizationId),
                  eq(recruitingGroupMember.userId, member.userId),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(user.name)),
  ]);

  const groups = new Map<string, RecruitingGroupBoardRow>();
  for (const row of rows) {
    let group = groups.get(row.groupId);
    if (!group) {
      group = {
        createdAt: row.groupCreatedAt.toISOString(),
        id: row.groupId,
        isDefault: row.groupIsDefault,
        memberUserIds: [],
        members: [],
        name: row.groupName,
      };
      groups.set(row.groupId, group);
    }
    if (row.memberId && row.memberUserId && row.memberRole) {
      group.memberUserIds.push(row.memberUserId);
      group.members.push({
        email: row.memberEmail ?? "—",
        id: row.memberId,
        image: row.memberImage ?? null,
        name: row.memberName ?? row.memberEmail ?? "未命名",
        role: row.memberRole as RecruitingGroupRole,
        userId: row.memberUserId,
      });
    }
  }
  return [
    ...groups.values(),
    {
      createdAt: new Date(0).toISOString(),
      id: UNGROUPED_RECRUITING_GROUP_ID,
      isDefault: false,
      isVirtual: true,
      memberUserIds: ungroupedRows.map((row) => row.userId),
      members: ungroupedRows.map((row) => ({
        email: row.email,
        id: `${UNGROUPED_RECRUITING_GROUP_ID}:${row.userId}`,
        image: row.image ?? null,
        name: row.name ?? row.email ?? "未命名",
        role: null,
        userId: row.userId,
      })),
      name: "未分组",
    },
  ];
}

export async function findRecruitingGroupByName({
  excludeGroupId,
  name,
  organizationId,
}: {
  excludeGroupId?: string;
  name: string;
  organizationId: string;
}) {
  const filters = [
    eq(recruitingGroup.organizationId, organizationId),
    eq(recruitingGroup.name, name),
  ];
  if (excludeGroupId) {
    filters.push(sql`${recruitingGroup.id} <> ${excludeGroupId}`);
  }

  const [row] = await db
    .select({ id: recruitingGroup.id })
    .from(recruitingGroup)
    .where(and(...filters))
    .limit(1);
  return row ?? null;
}

export async function addRecruitingGroupMember({
  createdBy,
  groupId,
  organizationId,
  role,
  userId,
}: {
  createdBy: string | null | undefined;
  groupId: string;
  organizationId: string;
  role: RecruitingGroupRole;
  userId: string;
}) {
  const [scope] = await db
    .select({ groupId: recruitingGroup.id, userId: member.userId })
    .from(recruitingGroup)
    .innerJoin(
      member,
      and(eq(member.organizationId, recruitingGroup.organizationId), eq(member.userId, userId)),
    )
    .where(and(eq(recruitingGroup.organizationId, organizationId), eq(recruitingGroup.id, groupId)))
    .limit(1);

  if (!scope) {
    return null;
  }

  const [created] = await db
    .insert(recruitingGroupMember)
    .values({
      createdBy: createdBy ?? null,
      groupId,
      id: crypto.randomUUID(),
      organizationId,
      role,
      userId,
    })
    .onConflictDoNothing({
      target: [
        recruitingGroupMember.organizationId,
        recruitingGroupMember.groupId,
        recruitingGroupMember.userId,
      ],
    })
    .returning({ id: recruitingGroupMember.id });

  if (created) {
    return created;
  }

  const [existing] = await db
    .select({ id: recruitingGroupMember.id })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.groupId, groupId),
        eq(recruitingGroupMember.userId, userId),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function updateRecruitingGroupMemberRole({
  groupId,
  organizationId,
  role,
  userId,
}: {
  groupId: string;
  organizationId: string;
  role: RecruitingGroupRole;
  userId: string;
}) {
  const [updated] = await db
    .update(recruitingGroupMember)
    .set({ role, updatedAt: new Date() })
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.groupId, groupId),
        eq(recruitingGroupMember.userId, userId),
      ),
    )
    .returning({ id: recruitingGroupMember.id });
  return updated ?? null;
}

export async function removeRecruitingGroupMember({
  groupId,
  organizationId,
  userId,
}: {
  groupId: string;
  organizationId: string;
  userId: string;
}) {
  const rows = await db
    .delete(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.groupId, groupId),
        eq(recruitingGroupMember.userId, userId),
      ),
    )
    .returning({ id: recruitingGroupMember.id });
  return rows.length > 0;
}

export interface MemberLastActiveRow {
  userId: string;
  /** ISO 字符串 / null 代表该用户从未登录过。 */
  lastActiveAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 取工作区每个成员"最近一次活跃"时间。
 *
 * 数据源：`COALESCE(MAX(session.updated_at), user.last_active_at)`。
 *   - `MAX(session.updatedAt)`：当前还有活跃 session 时给出滚动更新的细粒度时间
 *     （受 `session.updateAge` 限制，配置成了 5 分钟）。
 *   - `user.lastActiveAt`：每次新建 session 时由 databaseHooks.session.create.after
 *     写入；session 行后续被登出/过期清理后这个值仍在，作为兜底。两者并存能
 *     避免"昨天还在用今天却显示从未登录"的回归。
 *
 * Source: `COALESCE(MAX(session.updated_at), user.last_active_at)`. The
 * session-side MAX gives sub-day granularity while there's an active session
 * (capped by `session.updateAge`, set to 5min). user.lastActiveAt is the
 * durable anchor written on every sign-in via the session.create.after hook,
 * surviving logout/expiry so the column doesn't regress to "从未登录" after a
 * previously-seen user logs out.
 */
export async function listWorkspaceMemberLastActives(
  organizationId: string,
): Promise<MemberLastActiveRow[]> {
  const memberIds = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const userIds = memberIds.map((row) => row.userId);
  if (userIds.length === 0) {
    return [];
  }

  // Auth timestamps are stored as timestamptz, so the raw aggregate can leave
  // Postgres as a real instant and the client renders it in the browser's
  // current timezone.
  const rows = await db
    .select({
      lastActiveAt:
        sql<Date | null>`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`.as(
          "last_active_at",
        ),
      userId: user.id,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .where(inArray(user.id, userIds))
    .groupBy(user.id)
    .orderBy(desc(sql`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`));

  return rows.map((row) => ({
    lastActiveAt: toIso(row.lastActiveAt),
    userId: row.userId,
  }));
}
