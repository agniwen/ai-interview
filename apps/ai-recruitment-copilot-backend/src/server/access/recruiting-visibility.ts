import { and, eq, inArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { member, recruitingGroupMember } from "@arc/db-schema/schema";

export type RecruitingVisibilityScope =
  | { kind: "all" }
  | { kind: "restricted"; userIds: string[] }
  | { kind: "none" };

const ALL_DATA_ROLES = new Set(["owner", "admin"]);

const GROUP_ROLE_RANK: Record<string, number> = {
  hr: 1,
  recruitingLead: 2,
  recruitingSupervisor: 3,
  viewer: 0,
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

  const currentMemberships = await db
    .select({ groupId: recruitingGroupMember.groupId, role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );

  if (currentMemberships.length === 0) {
    return { kind: "restricted", userIds: [userId] };
  }

  const ownRankByGroup = new Map(
    currentMemberships.map((row) => [row.groupId, GROUP_ROLE_RANK[row.role] ?? 0]),
  );
  const groupRows = await db
    .select({
      groupId: recruitingGroupMember.groupId,
      role: recruitingGroupMember.role,
      userId: recruitingGroupMember.userId,
    })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        inArray(recruitingGroupMember.groupId, [...ownRankByGroup.keys()]),
      ),
    );

  const visible = new Set<string>([userId]);
  for (const row of groupRows) {
    const ownRank = ownRankByGroup.get(row.groupId) ?? 0;
    const targetRank = GROUP_ROLE_RANK[row.role] ?? 0;
    if (ownRank >= GROUP_ROLE_RANK.recruitingLead && targetRank < ownRank) {
      visible.add(row.userId);
    }
  }

  return {
    kind: "restricted",
    userIds: [...visible],
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
