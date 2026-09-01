import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../lib/server/db/index";
import { member, recruitingGroupMember } from "@arc/db-schema/schema";

export type RecruitingVisibilityScope =
  | { kind: "all" }
  | { kind: "restricted"; userIds: string[] }
  | { kind: "none" };

const ALL_DATA_ROLES = new Set(["owner", "admin"]);

const GROUP_ROLE_RANK = new Map<string, number>([
  ["hr", 1],
  ["recruitingLead", 2],
  ["recruitingSupervisor", 3],
  ["viewer", 0],
]);

export function resolveRecruitingVisibilityScopeFromRows(input: {
  currentMemberships: { groupId: string; role: string }[];
  groupRows: { groupId: string; role: string; userId: string }[];
  memberRole: string;
  userId: string;
}): RecruitingVisibilityScope {
  if (ALL_DATA_ROLES.has(input.memberRole)) {
    return { kind: "all" };
  }
  if (input.currentMemberships.length === 0) {
    return { kind: "restricted", userIds: [input.userId] };
  }

  const ownRankByGroup = new Map(
    input.currentMemberships.map((row) => [row.groupId, GROUP_ROLE_RANK.get(row.role) ?? 0]),
  );
  const visible = new Set<string>([input.userId]);
  for (const row of input.groupRows) {
    const ownRank = ownRankByGroup.get(row.groupId) ?? 0;
    const targetRank = GROUP_ROLE_RANK.get(row.role) ?? 0;
    if (ownRank >= (GROUP_ROLE_RANK.get("recruitingLead") ?? 0) && targetRank < ownRank) {
      visible.add(row.userId);
    }
  }
  return { kind: "restricted", userIds: [...visible] };
}

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

  const currentMemberships = await db
    .select({ groupId: recruitingGroupMember.groupId, role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );

  const groupRows =
    currentMemberships.length === 0
      ? []
      : await db
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
                currentMemberships.map((row) => row.groupId),
              ),
            ),
          );

  return resolveRecruitingVisibilityScopeFromRows({
    currentMemberships,
    groupRows,
    memberRole: currentMember.role,
    userId,
  });
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
