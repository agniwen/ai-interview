import type { statement } from "@arc/shared/permissions";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { hasWorkspacePermission } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-permissions";
import { isNoAccessWorkspaceRole } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-roles";
import { recruitingGroupMember } from "@arc/db-schema/schema";

export type WorkspaceResource = keyof typeof statement;
export type WorkspaceAction<R extends WorkspaceResource> = (typeof statement)[R][number];

export type WorkspaceAuthorizer = <R extends WorkspaceResource>(input: {
  action: WorkspaceAction<R>;
  resource: R;
}) => Promise<boolean>;

const RECRUITING_GROUP_RESOURCES = new Set<WorkspaceResource>([
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

function groupRoleAllows(role: string, action: string): boolean {
  if (action === "read") {
    return true;
  }
  return role === "hr" || role === "recruitingLead" || role === "recruitingSupervisor";
}

async function hasRecruitingGroupPermission({
  action,
  organizationId,
  userId,
}: {
  action: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );
  return rows.some((row) => groupRoleAllows(row.role, action));
}

/**
 * Bind workspace identity and request credentials once, then authorize every
 * resource against that immutable request scope.
 */
export function createRequestWorkspaceAuthorizer({
  headers,
  memberRole,
  organizationId,
  userId,
}: {
  headers: Headers;
  memberRole: string | null | undefined;
  organizationId: string;
  userId: string | null | undefined;
}): WorkspaceAuthorizer {
  return async ({ action, resource }) => {
    if (isNoAccessWorkspaceRole(memberRole)) {
      return false;
    }
    if (memberRole === "member" && RECRUITING_GROUP_RESOURCES.has(resource)) {
      if (!userId) {
        return false;
      }
      return await hasRecruitingGroupPermission({ action, organizationId, userId });
    }
    return await hasWorkspacePermission({
      action,
      headers,
      organizationId,
      resource,
    });
  };
}
