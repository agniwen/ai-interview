import { Inject, Injectable } from "@nestjs/common";
import { nanoid } from "nanoid";
import { member } from "@arc/db-schema/schema";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import { InvalidJoinLinkError, TOP_LEVEL_JOIN_EFFECTS_PORT } from "./join.port.js";
import type {
  JoinAcceptResult,
  JoinPreview,
  TopLevelJoinEffectsPort,
  TopLevelJoinPort,
} from "./join.port.js";

@Injectable()
export class JoinService implements TopLevelJoinPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
    @Inject(TOP_LEVEL_JOIN_EFFECTS_PORT)
    private readonly effects: TopLevelJoinEffectsPort,
  ) {}

  async preview(input: { code: string; userId: string | null }): Promise<JoinPreview> {
    const link = await this.database.query.workspaceInviteLink.findFirst({
      where: { code: input.code, disabledAt: { isNull: true } },
    });
    if (!link) {
      return { valid: false };
    }
    const organization = await this.database.query.organization.findFirst({
      where: { id: link.organizationId },
    });
    if (!organization) {
      return { valid: false };
    }
    const existing = input.userId
      ? await this.database.query.member.findFirst({
          where: { organizationId: organization.id, userId: input.userId },
        })
      : null;
    return {
      alreadyMember: Boolean(existing),
      initialRole: link.initialRole,
      valid: true,
      workspace: {
        id: organization.id,
        logo: organization.logo,
        name: organization.name,
        slug: organization.slug,
      },
    };
  }

  async accept(input: { code: string; userId: string }): Promise<JoinAcceptResult> {
    let creatorUserId: string | null = null;
    const result = await this.database.transaction(async (transaction) => {
      const link = await transaction.query.workspaceInviteLink.findFirst({
        where: { code: input.code, disabledAt: { isNull: true } },
      });
      if (!link) {
        throw new InvalidJoinLinkError();
      }
      creatorUserId = link.createdBy;
      const organization = await transaction.query.organization.findFirst({
        where: { id: link.organizationId },
      });
      if (!organization) {
        throw new InvalidJoinLinkError();
      }
      const existing = await transaction.query.member.findFirst({
        where: { organizationId: organization.id, userId: input.userId },
      });
      if (existing) {
        return {
          organizationId: organization.id,
          organizationSlug: organization.slug,
          role: existing.role,
          status: "already_member" as const,
        };
      }

      const role = link.initialRole || NO_ACCESS_WORKSPACE_ROLE;
      try {
        await transaction.insert(member).values({
          createdAt: new Date(),
          id: `mem_${nanoid(16)}`,
          inviteLinkId: link.id,
          organizationId: organization.id,
          role,
          userId: input.userId,
        });
      } catch (error) {
        const concurrent = await transaction.query.member.findFirst({
          where: { organizationId: organization.id, userId: input.userId },
        });
        if (concurrent) {
          return {
            organizationId: organization.id,
            organizationSlug: organization.slug,
            role: concurrent.role,
            status: "already_member" as const,
          };
        }
        throw error;
      }
      return {
        organizationId: organization.id,
        organizationSlug: organization.slug,
        role,
        status: "joined" as const,
      };
    });

    if (result.status === "joined" && result.role === "member") {
      await this.effects.addMemberToDefaultRecruitingGroup({
        createdBy: creatorUserId,
        organizationId: result.organizationId,
        userId: input.userId,
      });
    }
    if (result.status === "joined") {
      await this.effects.notifyInviteCreatorMemberJoined({
        creatorUserId,
        joinedUserId: input.userId,
        organizationId: result.organizationId,
      });
    }
    return result;
  }
}
