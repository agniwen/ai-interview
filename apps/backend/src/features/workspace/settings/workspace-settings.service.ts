import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, gte, notExists, sql } from "drizzle-orm";
import { startOfBeijingDay } from "@arc/shared/beijing-calendar";
import {
  member,
  organization,
  recruitingGroup,
  recruitingGroupMember,
  session,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";
import type { z } from "zod";
import type { groupSchema } from "./workspace-settings.schemas.js";
import { recruitingGroupRoleSchema } from "./workspace-settings.schemas.js";

type GroupRole = z.infer<typeof recruitingGroupRoleSchema>;
const DEFAULT_GROUP_NAME = "默认招聘组";
const UNGROUPED_ID = "__ungrouped__";

@Injectable()
export class WorkspaceSettingsService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async ensureDefaultGroup(organizationId: string, actorId: string) {
    const existing = await this.database
      .select()
      .from(recruitingGroup)
      .where(
        and(
          eq(recruitingGroup.organizationId, organizationId),
          eq(recruitingGroup.isDefault, true),
        ),
      )
      .limit(1);
    if (existing[0]) {
      return existing[0];
    }
    const inserted = await this.database
      .insert(recruitingGroup)
      .values({
        createdBy: actorId,
        id: crypto.randomUUID(),
        isDefault: true,
        name: DEFAULT_GROUP_NAME,
        organizationId,
      })
      .onConflictDoNothing()
      .returning();
    return inserted[0];
  }

  async listGroups(organizationId: string, actorId: string) {
    await this.ensureDefaultGroup(organizationId, actorId);
    const [rows, ungrouped] = await Promise.all([
      this.database
        .select({
          createdAt: recruitingGroup.createdAt,
          email: user.email,
          groupId: recruitingGroup.id,
          image: user.image,
          isDefault: recruitingGroup.isDefault,
          memberId: recruitingGroupMember.id,
          name: user.name,
          role: recruitingGroupMember.role,
          title: recruitingGroup.name,
          userId: recruitingGroupMember.userId,
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
      this.database
        .select({ email: user.email, image: user.image, name: user.name, userId: member.userId })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, organizationId),
            notExists(
              this.database
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
        ),
    ]);
    const grouped = new Map<string, z.infer<typeof groupSchema>>();
    for (const row of rows) {
      let group = grouped.get(row.groupId);
      if (!group) {
        group = {
          createdAt: row.createdAt.toISOString(),
          id: row.groupId,
          isDefault: row.isDefault,
          memberUserIds: [],
          members: [],
          name: row.title,
        };
        grouped.set(row.groupId, group);
      }
      const role = recruitingGroupRoleSchema.safeParse(row.role);
      if (row.memberId && row.userId && role.success) {
        group.memberUserIds.push(row.userId);
        group.members.push({
          email: row.email ?? "—",
          id: row.memberId,
          image: row.image,
          name: row.name ?? row.email ?? "未命名",
          role: role.data,
          userId: row.userId,
        });
      }
    }
    return {
      groups: [
        ...grouped.values(),
        {
          createdAt: new Date(0).toISOString(),
          id: UNGROUPED_ID,
          isDefault: false,
          isVirtual: true,
          memberUserIds: ungrouped.map((row) => row.userId),
          members: ungrouped.map((row) => ({
            email: row.email,
            id: `${UNGROUPED_ID}:${row.userId}`,
            image: row.image,
            name: row.name ?? row.email,
            role: null,
            userId: row.userId,
          })),
          name: "未分组",
        },
      ],
    };
  }

  async createGroup(organizationId: string, actorId: string, name: string) {
    const rows = await this.database
      .insert(recruitingGroup)
      .values({ createdBy: actorId, id: crypto.randomUUID(), name, organizationId })
      .onConflictDoNothing({ target: [recruitingGroup.organizationId, recruitingGroup.name] })
      .returning();
    if (!rows[0]) {
      throw new ConflictException("同一工作区内已存在同名招聘组。", {
        errorCode: "RECRUITING_GROUP_NAME_CONFLICT",
      });
    }
    return {
      ...rows[0],
      createdAt: rows[0].createdAt.toISOString(),
      memberUserIds: [],
      members: [],
    };
  }

  async updateGroup(organizationId: string, id: string, name: string) {
    const duplicate = await this.database
      .select({ id: recruitingGroup.id })
      .from(recruitingGroup)
      .where(
        and(
          eq(recruitingGroup.organizationId, organizationId),
          eq(recruitingGroup.name, name),
          sql`${recruitingGroup.id} <> ${id}`,
        ),
      )
      .limit(1);
    if (duplicate[0]) {
      throw new ConflictException("同一工作区内已存在同名招聘组。", {
        errorCode: "RECRUITING_GROUP_NAME_CONFLICT",
      });
    }
    const rows = await this.database
      .update(recruitingGroup)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(recruitingGroup.organizationId, organizationId), eq(recruitingGroup.id, id)))
      .returning();
    if (!rows[0]) {
      throw new NotFoundException("组别不存在。", { errorCode: "RECRUITING_GROUP_NOT_FOUND" });
    }
    return {
      ...rows[0],
      createdAt: rows[0].createdAt.toISOString(),
      memberUserIds: [],
      members: [],
    };
  }

  async removeGroup(organizationId: string, id: string) {
    const rows = await this.database
      .delete(recruitingGroup)
      .where(
        and(
          eq(recruitingGroup.organizationId, organizationId),
          eq(recruitingGroup.id, id),
          eq(recruitingGroup.isDefault, false),
        ),
      )
      .returning({ id: recruitingGroup.id });
    if (!rows[0]) {
      throw new NotFoundException("组别不存在。", { errorCode: "RECRUITING_GROUP_NOT_FOUND" });
    }
    return { success: true } as const;
  }

  async addMember(
    organizationId: string,
    groupId: string,
    actorId: string,
    userId: string,
    role: GroupRole,
  ) {
    const scope = await this.database
      .select({ groupId: recruitingGroup.id })
      .from(recruitingGroup)
      .innerJoin(
        member,
        and(eq(member.organizationId, recruitingGroup.organizationId), eq(member.userId, userId)),
      )
      .where(
        and(eq(recruitingGroup.organizationId, organizationId), eq(recruitingGroup.id, groupId)),
      )
      .limit(1);
    if (!scope[0]) {
      throw new NotFoundException("组别或成员不存在。", {
        errorCode: "RECRUITING_GROUP_OR_MEMBER_NOT_FOUND",
      });
    }
    const rows = await this.database
      .insert(recruitingGroupMember)
      .values({
        createdBy: actorId,
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
    if (!rows[0]) {
      throw new ConflictException("该成员已在这个招聘组中。", {
        errorCode: "RECRUITING_GROUP_MEMBER_EXISTS",
      });
    }
    return { id: rows[0].id, success: true } as const;
  }

  async updateMemberRole(organizationId: string, groupId: string, userId: string, role: GroupRole) {
    const rows = await this.database
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
    if (!rows[0]) {
      throw new NotFoundException("组成员不存在。", {
        errorCode: "RECRUITING_GROUP_MEMBER_NOT_FOUND",
      });
    }
    return { id: rows[0].id, success: true } as const;
  }

  async removeMember(organizationId: string, groupId: string, userId: string) {
    const rows = await this.database
      .delete(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, organizationId),
          eq(recruitingGroupMember.groupId, groupId),
          eq(recruitingGroupMember.userId, userId),
        ),
      )
      .returning({ id: recruitingGroupMember.id });
    if (!rows[0]) {
      throw new NotFoundException("组成员不存在。", {
        errorCode: "RECRUITING_GROUP_MEMBER_NOT_FOUND",
      });
    }
    return { success: true } as const;
  }

  deprecatedMemberGroup() {
    throw new GoneException("该接口已废弃，请使用 /groups/:id/members 管理成员和组内角色。", {
      errorCode: "WORKSPACE_MEMBER_GROUP_ENDPOINT_RETIRED",
    });
  }

  async updateWorkspace(organizationId: string, name: string) {
    const rows = await this.database
      .update(organization)
      .set({ name })
      .where(eq(organization.id, organizationId))
      .returning();
    if (!rows[0]) {
      throw new NotFoundException("工作区不存在。", { errorCode: "WORKSPACE_NOT_FOUND" });
    }
    return { ...rows[0], createdAt: rows[0].createdAt.toISOString() };
  }

  async listLastActives(organizationId: string) {
    const rows = await this.database
      .select({
        lastActiveAt: sql<
          Date | string | null
        >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`,
        userId: user.id,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(session, eq(session.userId, user.id))
      .where(eq(member.organizationId, organizationId))
      .groupBy(user.id);
    return {
      records: rows.map((row) => ({
        lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null,
        userId: row.userId,
      })),
    };
  }

  async getMyActivity(organizationId: string, actorId: string) {
    const since = startOfBeijingDay(new Date(Date.now() - 364 * 86_400_000));
    const day = sql<string>`to_char(date_trunc('day', ${studioInterview.createdAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;
    const rows = await this.database
      .select({ count: count(), day })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.organizationId, organizationId),
          eq(studioInterview.createdBy, actorId),
          gte(studioInterview.createdAt, since),
        ),
      )
      .groupBy(day)
      .orderBy(day);
    return { dailyAdded: rows };
  }
}
