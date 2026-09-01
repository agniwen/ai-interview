import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { member, recruitingGroup, recruitingGroupMember } from "@arc/db-schema/schema";
import { HTTP_DATABASE } from "../../../infrastructure/http/http.ports.js";
import type { HttpDatabase } from "../../../infrastructure/http/http.ports.js";
import { JOIN_NOTIFICATION_PORT } from "./join.port.js";
import type { JoinEffectsPort, JoinNotificationPort } from "./join.port.js";

@Injectable()
export class JoinEffectsService implements JoinEffectsPort {
  constructor(
    @Inject(HTTP_DATABASE)
    private readonly database: HttpDatabase,
    @Inject(JOIN_NOTIFICATION_PORT)
    private readonly notifications: JoinNotificationPort,
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
