import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/client/auth-client";
import { isBuiltInWorkspaceRole } from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { sortDynamicWorkspaceRolesByCreatedAt } from "@/components/features/studio/members/workspace-role-permissions";

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_TAB = "members";
export const WORKSPACE_MANAGEMENT_TABS = ["members", "groups"] as const;

export type WorkspaceManagementTab = (typeof WORKSPACE_MANAGEMENT_TABS)[number];

export interface WorkspaceManagementSearch {
  tab?: WorkspaceManagementTab;
}

export function parseWorkspaceManagementTab(value: unknown): WorkspaceManagementTab {
  return value === "groups" ? "groups" : DEFAULT_TAB;
}

export function coerceWorkspaceManagementSearch(
  search: Record<string, unknown>,
): WorkspaceManagementSearch {
  const tab = parseWorkspaceManagementTab(search.tab);
  return tab === DEFAULT_TAB ? {} : { tab };
}

export function buildWorkspaceManagementSearch(
  previous: WorkspaceManagementSearch,
  tab: WorkspaceManagementTab,
): WorkspaceManagementSearch {
  if (tab === DEFAULT_TAB) {
    const { tab: _tab, ...rest } = previous;
    return rest;
  }
  return { ...previous, tab };
}

export interface MemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
  createdAt: string | Date;
  lastActiveAt: string | null;
}

export interface DynamicWorkspaceRole {
  createdAt: Date | string;
  id: string;
  name: string;
  role: string;
}

export type RecruitingGroupRole = "recruitingSupervisor" | "recruitingLead" | "hr" | "viewer";

export interface RecruitingGroupMemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: RecruitingGroupRole | null;
}

export interface RecruitingGroupRow {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
  isVirtual?: boolean;
  members: RecruitingGroupMemberRow[];
  memberUserIds: string[];
}

export const EMPTY_RECRUITING_GROUPS: RecruitingGroupRow[] = [];
const WORKSPACE_ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "secondary",
  member: "outline",
  noAccess: "outline",
  owner: "default",
};

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
    builtInRoles = ["admin", "member", "noAccess"];
  } else if (currentRole === "admin") {
    builtInRoles = ["member", "noAccess"];
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
      return (data ?? []) as DynamicWorkspaceRole[];
    },
    queryKey: ["workspace-dynamic-roles", workspaceId],
    refetchOnWindowFocus: false,
    select: sortDynamicWorkspaceRolesByCreatedAt,
  });
}

export const GROUP_ROLE_LABELS: Record<RecruitingGroupRole, string> = {
  hr: "招聘成员",
  recruitingLead: "招聘组长",
  recruitingSupervisor: "招聘主管",
  viewer: "只读成员",
};

export const GROUP_ROLE_BADGE_VARIANT: Record<
  RecruitingGroupRole,
  "default" | "secondary" | "outline"
> = {
  hr: "secondary",
  recruitingLead: "secondary",
  recruitingSupervisor: "default",
  viewer: "outline",
};
