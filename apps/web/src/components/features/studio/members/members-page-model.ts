import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { listTextQuery } from "@arc/shared/list-text-filters";
import type { DataGridFetchParams } from "@/components/data-grid";

import { authClient } from "@/lib/client/auth-client";
import { isBuiltInWorkspaceRole } from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { sortDynamicWorkspaceRolesByCreatedAt } from "@/components/features/studio/members/workspace-role-permissions";

export const DEFAULT_PAGE_SIZE = 10;
export const WORKSPACE_MEMBER_SORT_IDS = ["createdAt", "lastActiveAt"] as const;
export const WORKSPACE_MEMBER_DEFAULT_SORTING = [{ desc: true, id: "createdAt" }] as const;
export type WorkspaceMemberSortColumn = (typeof WORKSPACE_MEMBER_SORT_IDS)[number];

function isWorkspaceMemberSortColumn(
  value: string | undefined,
): value is WorkspaceMemberSortColumn {
  return WORKSPACE_MEMBER_SORT_IDS.some((column) => column === value);
}

export function buildWorkspaceMemberListQuery(
  params: DataGridFetchParams<{ textFilters: string }>,
) {
  return {
    ...listTextQuery(params),
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: isWorkspaceMemberSortColumn(params.sortBy) ? params.sortBy : "createdAt",
    sortOrder: params.sortOrder ?? "desc",
  };
}

export function getPageAfterMemberRemoval({
  page,
  visibleRowCount,
}: {
  page: number;
  visibleRowCount: number;
}): number {
  return page > 1 && visibleRowCount === 1 ? page - 1 : page;
}
export { DEFAULT_WORKSPACE_MANAGEMENT_TAB as DEFAULT_TAB } from "@/components/features/studio/members/workspace-management-search";
export {
  buildWorkspaceManagementSearch,
  coerceWorkspaceManagementSearch,
  parseWorkspaceManagementTab,
} from "@/components/features/studio/members/workspace-management-search";
export type {
  WorkspaceManagementSearch,
  WorkspaceManagementTab,
} from "@/components/features/studio/members/workspace-management-search";

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

export interface GroupNameDraftState {
  drafts: Record<string, string>;
  groupIdsKey: string;
  workspaceId: string;
}

export function reconcileGroupNameDraftState(
  groups: readonly Pick<RecruitingGroupRow, "id">[],
  workspaceId: string,
  state: GroupNameDraftState,
): GroupNameDraftState {
  const groupIds = groups.map((group) => group.id);
  const groupIdsKey = JSON.stringify(groupIds);
  if (state.workspaceId !== workspaceId) {
    return { drafts: {}, groupIdsKey, workspaceId };
  }
  if (state.groupIdsKey === groupIdsKey) {
    return state;
  }
  const visibleGroupIds = new Set(groupIds);
  return {
    drafts: Object.fromEntries(
      Object.entries(state.drafts).filter(([groupId]) => visibleGroupIds.has(groupId)),
    ),
    groupIdsKey,
    workspaceId,
  };
}

export function resolveGroupNameDrafts(
  groups: readonly Pick<RecruitingGroupRow, "id" | "name">[],
  userDrafts: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(groups.map((group) => [group.id, userDrafts[group.id] ?? group.name]));
}

const WORKSPACE_ROLE_BADGE_VARIANT = {
  admin: "secondary",
  member: "outline",
  noAccess: "outline",
  owner: "default",
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
      const result = z.array(dynamicWorkspaceRoleSchema).safeParse(data);
      return result.success ? result.data : [];
    },
    queryKey: ["workspace-dynamic-roles", workspaceId],
    refetchOnWindowFocus: false,
    select: sortDynamicWorkspaceRolesByCreatedAt,
  });
}

export const GROUP_ROLE_LABELS = {
  hr: "招聘成员",
  recruitingLead: "招聘组长",
  recruitingSupervisor: "招聘主管",
  viewer: "只读成员",
} as const satisfies Record<RecruitingGroupRole, string>;

export const GROUP_ROLE_BADGE_VARIANT = {
  hr: "secondary",
  recruitingLead: "secondary",
  recruitingSupervisor: "default",
  viewer: "outline",
} as const satisfies Record<RecruitingGroupRole, "default" | "secondary" | "outline">;
