import { statement } from "@arc/shared/permissions";
import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { recruitingGroupMember } from "@arc/db-schema/schema";

type WorkspaceResource = keyof typeof statement;

/**
 * Business resources gated by recruiting-group membership when the workspace
 * role is `member`. Must stay aligned with createRequestWorkspaceAuthorizer.
 */
export const RECRUITING_GROUP_RESOURCES = new Set<WorkspaceResource>([
  "candidateForm",
  "department",
  "globalConfig",
  "interview",
  "interviewer",
  "jd",
  "resumeLibrary",
  "resumePool",
  "resumeUploadBatch",
  "questionTemplate",
]);

export function groupRoleAllows(role: string, action: string): boolean {
  if (action === "read") {
    return true;
  }
  return role === "hr" || role === "recruitingLead" || role === "recruitingSupervisor";
}

export async function listRecruitingGroupRoles({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<string[]> {
  const rows = await db
    .select({ role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );
  return rows.map((row) => row.role);
}

export function recruitingGroupAllows({
  action,
  groupRoles,
}: {
  action: string;
  groupRoles: readonly string[];
}): boolean {
  return groupRoles.some((role) => groupRoleAllows(role, action));
}

/**
 * Expand recruiting-group roles into the full action lists for each gated resource.
 */
export function statementsFromRecruitingGroupRoles(
  groupRoles: readonly string[],
): WorkspacePermissionStatements {
  if (groupRoles.length === 0) {
    return {};
  }

  const result: WorkspacePermissionStatements = {};
  for (const resource of RECRUITING_GROUP_RESOURCES) {
    const actions = statement[resource].filter((action) =>
      recruitingGroupAllows({ action, groupRoles }),
    );
    if (actions.length > 0) {
      (result as Record<string, string[]>)[resource] = [...actions];
    }
  }
  return result;
}
