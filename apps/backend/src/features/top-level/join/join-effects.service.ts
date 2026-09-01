import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { member, recruitingGroup, recruitingGroupMember } from "@arc/db-schema/schema";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import { TOP_LEVEL_JOIN_NOTIFICATION_PORT } from "./join.port.js";
import type { TopLevelJoinEffectsPort, TopLevelJoinNotificationPort } from "./join.port.js";

@Injectable()
export class JoinEffectsService implements TopLevelJoinEffectsPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
    @Inject(TOP_LEVEL_JOIN_NOTIFICATION_PORT)
    private readonly notifications: TopLevelJoinNotificationPort,
  ) {}

  async addMemberToDefaultRecruitingGroup(input: {
    createdBy: string | null;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const group = await this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: recruitingGroup.id })
        .from(recruitingGroup)
        .where(
          and(
            eq(recruitingGroup.organizationId, input.organizationId),
            eq(recruitingGroup.isDefault, true),
          ),
        )
        .limit(1);
      if (existing) {
        return existing;
      }
      const [inserted] = await transaction
        .insert(recruitingGroup)
        .values({
          createdBy: null,
          id: crypto.randomUUID(),
          isDefault: true,
          name: "默认招聘组",
          organizationId: input.organizationId,
        })
        .onConflictDoNothing({
          target: recruitingGroup.organizationId,
          where: sql`${recruitingGroup.isDefault} = true`,
        })
        .returning({ id: recruitingGroup.id });
      if (inserted) {
        return inserted;
      }
      const [concurrent] = await transaction
        .select({ id: recruitingGroup.id })
        .from(recruitingGroup)
        .where(
          and(
            eq(recruitingGroup.organizationId, input.organizationId),
            eq(recruitingGroup.isDefault, true),
          ),
        )
        .limit(1);
      if (!concurrent) {
        throw new Error("Failed to ensure default recruiting group");
      }
      return concurrent;
    });

    const [scope] = await this.database
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .limit(1);
    if (!scope) {
      return;
    }
    await this.database
      .insert(recruitingGroupMember)
      .values({
        createdBy: input.createdBy,
        groupId: group.id,
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        role: "hr",
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [
          recruitingGroupMember.organizationId,
          recruitingGroupMember.groupId,
          recruitingGroupMember.userId,
        ],
      });
  }

  async notifyInviteCreatorMemberJoined(input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  }): Promise<void> {
    try {
      await this.notifications.notifyInviteCreatorMemberJoined(input);
    } catch (error) {
      console.warn("[workspace-invite] failed to notify invitation creator", {
        error: error instanceof Error ? error.message : "unknown error",
        organizationId: input.organizationId,
      });
    }
  }
}
