import { and, eq, sql } from "drizzle-orm";
import { member, recruitingGroup, recruitingGroupMember, user } from "@arc/db-schema/schema";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { AuthMemberJoinedNotifier } from "./member-joined-notifier.js";

const DEFAULT_RECRUITING_GROUP_NAME = "默认招聘组";

export class OrganizationLifecycle {
  private readonly database: Database;
  private readonly notifier: AuthMemberJoinedNotifier;

  constructor(database: Database, notifier: AuthMemberJoinedNotifier) {
    this.database = database;
    this.notifier = notifier;
  }

  ensureDefaultRecruitingGroup(input: {
    creatorUserId: string | null | undefined;
    organizationId: string;
  }): Promise<string> {
    return this.database.transaction(async (transaction) => {
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
      const inserted = existing
        ? []
        : await transaction
            .insert(recruitingGroup)
            .values({
              createdBy: input.creatorUserId ?? null,
              id: crypto.randomUUID(),
              isDefault: true,
              name: DEFAULT_RECRUITING_GROUP_NAME,
              organizationId: input.organizationId,
            })
            .onConflictDoNothing({
              target: recruitingGroup.organizationId,
              where: sql`${recruitingGroup.isDefault} = true`,
            })
            .returning({ id: recruitingGroup.id });
      const fallback =
        existing || inserted[0]
          ? []
          : await transaction
              .select({ id: recruitingGroup.id })
              .from(recruitingGroup)
              .where(
                and(
                  eq(recruitingGroup.organizationId, input.organizationId),
                  eq(recruitingGroup.isDefault, true),
                ),
              )
              .limit(1);
      const group = existing ?? inserted[0] ?? fallback[0];
      if (!group) {
        throw new Error("Failed to ensure default recruiting group.");
      }
      if (!input.creatorUserId) {
        return group.id;
      }
      const [creatorMember] = await transaction
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            eq(member.userId, input.creatorUserId),
          ),
        )
        .limit(1);
      if (creatorMember) {
        await transaction
          .insert(recruitingGroupMember)
          .values({
            createdBy: input.creatorUserId,
            groupId: group.id,
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            role: "recruitingSupervisor",
            userId: input.creatorUserId,
          })
          .onConflictDoNothing({
            target: [
              recruitingGroupMember.organizationId,
              recruitingGroupMember.groupId,
              recruitingGroupMember.userId,
            ],
          });
      }
      return group.id;
    });
  }

  async addMemberToDefaultRecruitingGroup(input: {
    createdBy: string | null | undefined;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const groupId = await this.ensureDefaultRecruitingGroup({
      creatorUserId: null,
      organizationId: input.organizationId,
    });
    const [workspaceMember] = await this.database
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .limit(1);
    if (!workspaceMember) {
      throw new Error("Cannot add a non-member to the default recruiting group.");
    }
    await this.database
      .insert(recruitingGroupMember)
      .values({
        createdBy: input.createdBy ?? null,
        groupId,
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

  async clearRemovedMemberPreference(input: {
    organizationId: string;
    userId: string;
  }): Promise<void> {
    try {
      await this.database
        .update(user)
        .set({ lastActiveOrganizationId: null })
        .where(
          and(eq(user.id, input.userId), eq(user.lastActiveOrganizationId, input.organizationId)),
        );
    } catch (error) {
      console.warn("[auth] failed to clear stale workspace preference", error);
    }
  }

  async notifyMemberJoined(input: {
    creatorUserId: string | null;
    joinedUserId: string;
    organizationId: string;
  }): Promise<void> {
    try {
      await this.notifier.notify(input);
    } catch (error) {
      console.warn("[workspace-invite] failed to notify invitation creator", {
        error: error instanceof Error ? error.message : "unknown error",
        organizationId: input.organizationId,
      });
    }
  }
}
