import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { recruitingGroupMember } from "@arc/db-schema/schema";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type { RecruitingScopeQueries } from "./recruiting-scope.queries.js";

const GROUP_ROLE_RANK = new Map([
  ["viewer", 0],
  ["hr", 1],
  ["recruitingLead", 2],
  ["recruitingSupervisor", 3],
]);

@Injectable()
export class RecruitingScopeService implements RecruitingScopeQueries {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async visibleCreatorIds(organizationId: string, actorId: string, memberRole: string) {
    if (memberRole === "owner" || memberRole === "admin") {
      return null;
    }
    const memberships = await this.database
      .select({ groupId: recruitingGroupMember.groupId, role: recruitingGroupMember.role })
      .from(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, organizationId),
          eq(recruitingGroupMember.userId, actorId),
        ),
      );
    if (memberships.length === 0) {
      return [actorId];
    }
    const rows = await this.database
      .select({
        groupId: recruitingGroupMember.groupId,
        role: recruitingGroupMember.role,
        userId: recruitingGroupMember.userId,
      })
      .from(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, organizationId),
          inArray(
            recruitingGroupMember.groupId,
            memberships.map((row) => row.groupId),
          ),
        ),
      );
    const ranks = new Map(
      memberships.map((row) => [row.groupId, GROUP_ROLE_RANK.get(row.role) ?? 0]),
    );
    const visible = new Set([actorId]);
    for (const row of rows) {
      const ownRank = ranks.get(row.groupId) ?? 0;
      if (ownRank >= 2 && (GROUP_ROLE_RANK.get(row.role) ?? 0) < ownRank) {
        visible.add(row.userId);
      }
    }
    return [...visible];
  }
}
