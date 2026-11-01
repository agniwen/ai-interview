import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { authClient } from "@/lib/client/auth-client";
import { isBuiltInWorkspaceRole } from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { sortDynamicWorkspaceRolesByCreatedAt } from "@/components/features/studio/members/workspace-role-permissions";

const dynamicWorkspaceRoleSchema = z.object({
  createdAt: z.union([z.date(), z.string()]),
  id: z.string(),
  name: z.string(),
  role: z.string(),
});

export interface MemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
  createdAt: string;
  lastActiveAt: string | null;
  managerUserId: string | null;
  shareWithPeers: boolean;
  dottedManagerUserIds: string[];
}

export interface DynamicWorkspaceRole {
  createdAt: Date | string;
  id: string;
  name: string;
  role: string;
}

const WORKSPACE_ROLE_BADGE_VARIANT = {
  admin: "secondary",
  interviewer: "outline",
  member: "outline",
  noAccess: "outline",
  owner: "default",
  recruitingSupervisor: "secondary",
} as const satisfies Record<WorkspaceRole, "default" | "secondary" | "outline">;

export function getWorkspaceRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (!isBuiltInWorkspaceRole(role)) {
    return "outline";
  }
  return WORKSPACE_ROLE_BADGE_VARIANT[role];
}

export function buildAssignableWorkspaceRoles(
  currentRole: string,
  dynamicRoles: readonly DynamicWorkspaceRole[],
): readonly string[] {
  let builtInRoles: string[] = [];
  if (currentRole === "owner") {
    builtInRoles = ["admin", "recruitingSupervisor", "member", "interviewer", "noAccess"];
  } else if (currentRole === "admin") {
    builtInRoles = ["recruitingSupervisor", "member", "interviewer", "noAccess"];
  }
  return [...builtInRoles, ...dynamicRoles.map((role) => role.role)].filter(
    (role, index, list) => list.indexOf(role) === index,
  );
}

export function canEditMemberWorkspaceRole({
  assignableRoles,
  canUpdate,
  currentRole,
  currentUserId,
  row,
}: {
  assignableRoles: readonly string[];
  canUpdate: boolean;
  currentRole: string;
  currentUserId: string | undefined;
  row: MemberRow;
}): boolean {
  if (!(canUpdate && assignableRoles.length > 0)) {
    return false;
  }
  if (currentRole === "owner") {
    return row.role !== "owner";
  }
  return (
    currentRole === "admin" &&
    row.role !== "owner" &&
    row.role !== "admin" &&
    row.userId !== currentUserId
  );
}

export function useDynamicWorkspaceRoles(workspaceId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listRoles({
        query: { organizationId: workspaceId },
      });
      if (error) {
        throw new Error(error.message ?? "加载自定义角色失败");
      }
      const result = z.array(dynamicWorkspaceRoleSchema).safeParse(data);
      return result.success ? result.data : [];
    },
    queryKey: ["workspace-dynamic-roles", workspaceId],
    refetchOnWindowFocus: false,
    select: sortDynamicWorkspaceRolesByCreatedAt,
  });
}
