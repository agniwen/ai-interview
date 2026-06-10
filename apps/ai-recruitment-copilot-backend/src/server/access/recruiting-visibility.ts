import { and, eq, inArray, notExists } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { member, recruitingGroupMember } from "@arc/db-schema/schema";

export type RecruitingVisibilityScope =
  | { kind: "all" }
  | { kind: "restricted"; userIds: string[] }
  | { kind: "none" };

const ALL_DATA_ROLES = new Set(["owner", "admin"]);

const VISIBLE_ROLES_BY_ROLE: Record<string, readonly string[]> = {
  hr: [],
  recruitingLead: ["hr", "viewer"],
  recruitingSupervisor: ["recruitingLead", "hr", "viewer"],
  viewer: [],
};

export async function resolveRecruitingVisibilityScope({
  currentRole,
  organizationId,
  userId,
}: {
  currentRole?: string | null;
  organizationId: string;
  userId: string;
}): Promise<RecruitingVisibilityScope> {
  if (currentRole && ALL_DATA_ROLES.has(currentRole)) {
    return { kind: "all" };
  }

  const [currentMember] = await db
    .select({ role: member.role, userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);

  if (!currentMember) {
    return { kind: "none" };
  }

  if (ALL_DATA_ROLES.has(currentMember.role)) {
    return { kind: "all" };
  }

  const visibleRoles = VISIBLE_ROLES_BY_ROLE[currentMember.role] ?? [];
  if (visibleRoles.length === 0) {
    return { kind: "restricted", userIds: [userId] };
  }

  const [currentGroup] = await db
    .select({ groupId: recruitingGroupMember.groupId })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    )
    .limit(1);

  if (!currentGroup) {
    const ungroupedRows = await db
      .select({ role: member.role, userId: member.userId })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          inArray(member.role, [...visibleRoles]),
          notExists(
            db
              .select({ userId: recruitingGroupMember.userId })
              .from(recruitingGroupMember)
              .where(
                and(
                  eq(recruitingGroupMember.organizationId, organizationId),
                  eq(recruitingGroupMember.userId, member.userId),
                ),
              ),
          ),
        ),
      );

    return {
      kind: "restricted",
      userIds: [userId, ...ungroupedRows.map((row) => row.userId).filter((id) => id !== userId)],
    };
  }

  const groupRows = await db
    .select({ role: member.role, userId: member.userId })
    .from(recruitingGroupMember)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, recruitingGroupMember.organizationId),
        eq(member.userId, recruitingGroupMember.userId),
      ),
    )
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.groupId, currentGroup.groupId),
        inArray(member.role, [...visibleRoles]),
      ),
    );

  return {
    kind: "restricted",
    userIds: [userId, ...groupRows.map((row) => row.userId).filter((id) => id !== userId)],
  };
}

export function intersectRequestedCreatorIds(
  requestedCreatorIds: string[] | null | undefined,
  scope: RecruitingVisibilityScope,
): string[] | null {
  const requested = requestedCreatorIds?.filter((id) => id.trim().length > 0);

  if (scope.kind === "all") {
    return requested && requested.length > 0 ? requested : null;
  }

  if (scope.kind === "none") {
    return [];
  }

  if (!requested || requested.length === 0) {
    return scope.userIds;
  }

  const visible = new Set(scope.userIds);
  return requested.filter((id) => visible.has(id));
}
