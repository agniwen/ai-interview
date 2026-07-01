import {
  IconGripVertical,
  IconPlus,
  IconSettings,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import type { CollisionDetection, DragEndEvent } from "@dnd-kit/core";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/features/studio/page-header";
import { actionsColumn, customColumn, DataGrid } from "@/components/data-grid";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import { PermissionGate } from "@/components/features/permission/permission-gate";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rpc } from "@/lib/client/rpc";
import { authClient } from "@/lib/client/auth-client";
import { useHasPermission } from "@/hooks/use-has-permission";
import {
  useWorkspaceId,
  useWorkspaceMemberRole,
  useWorkspaceSlug,
} from "@/lib/client/workspace-context";
import { InviteDialog } from "@/components/features/studio/members/invite-dialog";
import { InviteLinksDialog } from "@/components/features/studio/members/invite-links-dialog";
import { PendingInvitationsButton } from "@/components/features/studio/members/pending-invitations-section";
import {
  buildWorkspaceRoleOptions,
  getWorkspaceRoleLabel,
  isBuiltInWorkspaceRole,
} from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { WorkspaceSettingsDialog } from "@/components/features/studio/members/workspace-settings-dialog";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_TAB = "members";
const WORKSPACE_MANAGEMENT_TABS = ["members", "groups"] as const;

type WorkspaceManagementTab = (typeof WORKSPACE_MANAGEMENT_TABS)[number];

interface WorkspaceManagementSearch {
  tab?: WorkspaceManagementTab;
}

function parseWorkspaceManagementTab(value: unknown): WorkspaceManagementTab {
  return value === "groups" ? "groups" : DEFAULT_TAB;
}

function coerceWorkspaceManagementSearch(
  search: Record<string, unknown>,
): WorkspaceManagementSearch {
  const tab = parseWorkspaceManagementTab(search.tab);
  return tab === DEFAULT_TAB ? {} : { tab };
}

function buildWorkspaceManagementSearch(
  previous: WorkspaceManagementSearch,
  tab: WorkspaceManagementTab,
): WorkspaceManagementSearch {
  if (tab === DEFAULT_TAB) {
    const { tab: _tab, ...rest } = previous;
    return rest;
  }
  return { ...previous, tab };
}

function getActiveWorkspaceOrganization<T extends { id: string }>(
  activeOrganization: T | null | undefined,
  workspaceId: string,
): T | null {
  if (activeOrganization?.id !== workspaceId) {
    return null;
  }
  return activeOrganization;
}

interface MemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
  createdAt: string | Date;
  lastActiveAt: string | null;
}

interface DynamicWorkspaceRole {
  id: string;
  name: string;
  role: string;
}

type RecruitingGroupRole = "recruitingSupervisor" | "recruitingLead" | "hr" | "viewer";

interface RecruitingGroupMemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: RecruitingGroupRole | null;
}

interface RecruitingGroupRow {
  id: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
  isVirtual?: boolean;
  members: RecruitingGroupMemberRow[];
  memberUserIds: string[];
}

const EMPTY_RECRUITING_GROUPS: RecruitingGroupRow[] = [];
const WORKSPACE_ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "secondary",
  member: "outline",
  noAccess: "outline",
  owner: "default",
};

function getWorkspaceRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (!isBuiltInWorkspaceRole(role)) {
    return "outline";
  }
  return WORKSPACE_ROLE_BADGE_VARIANT[role];
}

function buildAssignableWorkspaceRoles(
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

function canEditMemberWorkspaceRole({
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

function useDynamicWorkspaceRoles(workspaceId: string, enabled: boolean) {
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
  });
}

const GROUP_ROLE_LABELS: Record<RecruitingGroupRole, string> = {
  hr: "招聘成员",
  recruitingLead: "招聘组长",
  recruitingSupervisor: "招聘主管",
  viewer: "只读成员",
};

const GROUP_ROLE_BADGE_VARIANT: Record<RecruitingGroupRole, "default" | "secondary" | "outline"> = {
  hr: "secondary",
  recruitingLead: "secondary",
  recruitingSupervisor: "default",
  viewer: "outline",
};

const GROUP_ROLE_OPTIONS = [
  "recruitingSupervisor",
  "recruitingLead",
  "hr",
  "viewer",
] as const satisfies readonly RecruitingGroupRole[];

const DEFAULT_NEW_GROUP_MEMBER_ROLE = "hr" satisfies RecruitingGroupRole;

const recruitingGroupCollisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    return pointerWithin(args);
  }
  return closestCorners(args);
};

function normalizeGroupName(value: string) {
  return value.trim();
}

function hasDuplicateGroupName(
  groups: RecruitingGroupRow[],
  name: string,
  excludeGroupId?: string,
) {
  const normalizedName = normalizeGroupName(name);
  return groups.some(
    (group) =>
      !group.isVirtual &&
      group.id !== excludeGroupId &&
      normalizeGroupName(group.name) === normalizedName,
  );
}

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  return payload?.error ?? payload?.message ?? fallback;
}

function getColumnId(groupId: string) {
  return `group:${groupId}`;
}

function getPoolDragId(userId: string) {
  return `pool:${userId}`;
}

function getGroupMemberDragId(groupId: string, userId: string) {
  return `group-member:${groupId}:${userId}`;
}

function parseMemberDragId(value: string) {
  if (value.startsWith("pool:")) {
    return { sourceGroupId: null, userId: value.slice("pool:".length) };
  }
  if (value.startsWith("group-member:")) {
    const [, sourceGroupId, userId] = value.split(":");
    if (sourceGroupId && userId) {
      return { sourceGroupId, userId };
    }
  }
  return null;
}

function getGroupBadgeLabel(group: RecruitingGroupRow) {
  if (group.isDefault) {
    return "默认组";
  }
  if (group.isVirtual) {
    return "未分组";
  }
  return `${group.members.length} 人`;
}

interface RecruitingGroupsPanelProps {
  allRows: MemberRow[];
  canUpdate: boolean;
  groupNameDrafts: Record<string, string>;
  groups: RecruitingGroupRow[];
  newGroupName: string;
  onAddMemberToGroup: (row: MemberRow, groupId: string) => void;
  onCreateGroup: () => void;
  onDeleteGroup: (group: RecruitingGroupRow) => void;
  onGroupNameDraftChange: (groupId: string, value: string) => void;
  onRemoveGroupMember: (groupId: string, member: RecruitingGroupMemberRow) => void;
  onRenameGroup: (group: RecruitingGroupRow, name: string) => void;
  onMoveMemberToGroup: (row: MemberRow, sourceGroupId: string, targetGroupId: string) => void;
  onRoleChange: (
    groupId: string,
    member: RecruitingGroupMemberRow,
    role: RecruitingGroupRole,
  ) => void;
  pending: string | null;
  setNewGroupName: (value: string) => void;
}

function RecruitingGroupsPanel({
  allRows,
  canUpdate,
  groupNameDrafts,
  groups,
  newGroupName,
  onAddMemberToGroup,
  onCreateGroup,
  onDeleteGroup,
  onGroupNameDraftChange,
  onRemoveGroupMember,
  onRenameGroup,
  onMoveMemberToGroup,
  onRoleChange,
  pending,
  setNewGroupName,
}: RecruitingGroupsPanelProps) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const activeRow = useMemo(
    () => allRows.find((row) => row.userId === activeUserId) ?? null,
    [activeUserId, allRows],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveUserId(null);
    const parsed = parseMemberDragId(String(event.active.id));
    const row = parsed ? allRows.find((item) => item.userId === parsed.userId) : null;
    const overId = event.over?.id;
    if (!parsed || !row || !overId) {
      return;
    }
    const groupId = String(overId).replace(/^group:/u, "");
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup) {
      return;
    }
    if (targetGroup.isVirtual) {
      if (!parsed.sourceGroupId) {
        return;
      }
      const sourceGroup = groups.find((group) => group.id === parsed.sourceGroupId);
      const sourceMember = sourceGroup?.members.find((member) => member.userId === row.userId);
      if (sourceMember) {
        onRemoveGroupMember(parsed.sourceGroupId, sourceMember);
      }
      return;
    }
    if (parsed.sourceGroupId === groupId) {
      return;
    }
    if (targetGroup.memberUserIds.includes(row.userId)) {
      toast.error("该成员已在这个招聘组中");
      return;
    }
    if (parsed.sourceGroupId) {
      onMoveMemberToGroup(row, parsed.sourceGroupId, groupId);
      return;
    }
    onAddMemberToGroup(row, groupId);
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">招聘组看板</p>
          <p className="text-muted-foreground text-sm">
            从成员池拖拽到招聘组会添加一份组成员关系，组内身份彼此独立。
          </p>
        </div>
        {canUpdate ? (
          <div className="flex items-center gap-2 sm:w-72">
            <Input
              className="h-9"
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onCreateGroup();
                }
              }}
              placeholder="新组别"
              value={newGroupName}
            />
            <Button aria-label="新建组别" onClick={onCreateGroup} size="icon" variant="outline">
              <IconPlus className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <DndContext
        collisionDetection={recruitingGroupCollisionDetection}
        onDragCancel={() => setActiveUserId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={(event) =>
          setActiveUserId(parseMemberDragId(String(event.active.id))?.userId ?? null)
        }
        sensors={sensors}
      >
        <div className="min-w-0 rounded-lg border bg-background p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-medium text-sm">成员池</p>
            <Badge variant="outline">{allRows.length} 人</Badge>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {allRows.map((row) => (
              // eslint-disable-next-line no-use-before-define -- 同文件卡片组件，保持面板主结构先出现
              <MemberPoolCard canUpdate={canUpdate} key={row.userId} row={row} />
            ))}
          </div>
        </div>
        <div className="min-w-0 max-w-full">
          <div className="flex max-w-full gap-4 overflow-x-auto overscroll-x-contain px-px pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {groups.map((group) => (
              // eslint-disable-next-line no-use-before-define -- 同文件看板子组件，保持面板主结构先出现
              <RecruitingGroupColumn
                canUpdate={canUpdate}
                draftName={groupNameDrafts[group.id] ?? group.name}
                group={group}
                id={getColumnId(group.id)}
                key={group.id}
                onDeleteGroup={onDeleteGroup}
                onGroupNameDraftChange={onGroupNameDraftChange}
                onRemoveGroupMember={onRemoveGroupMember}
                onRenameGroup={onRenameGroup}
                onRoleChange={onRoleChange}
                pending={pending}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeRow ? (
            // eslint-disable-next-line no-use-before-define -- 同文件卡片组件，保持拖拽面板主结构先出现
            <MemberPoolCard canUpdate={false} isOverlay row={activeRow} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface RecruitingGroupColumnProps {
  canUpdate: boolean;
  draftName?: string;
  group: RecruitingGroupRow;
  id: string;
  onDeleteGroup: (group: RecruitingGroupRow) => void;
  onGroupNameDraftChange: (groupId: string, value: string) => void;
  onRemoveGroupMember: (groupId: string, member: RecruitingGroupMemberRow) => void;
  onRenameGroup: (group: RecruitingGroupRow, name: string) => void;
  onRoleChange: (
    groupId: string,
    member: RecruitingGroupMemberRow,
    role: RecruitingGroupRole,
  ) => void;
  pending: string | null;
}

function RecruitingGroupColumn({
  canUpdate,
  draftName,
  group,
  id,
  onDeleteGroup,
  onGroupNameDraftChange,
  onRemoveGroupMember,
  onRenameGroup,
  onRoleChange,
  pending,
}: RecruitingGroupColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canUpdate,
    id,
  });
  const canManageGroup = canUpdate && !group.isVirtual;

  return (
    <section
      className={`flex max-h-[680px] min-h-96 w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/25 transition-colors ${
        isOver ? "border-primary bg-primary/5" : ""
      }`}
      ref={setNodeRef}
    >
      <div className="space-y-3 border-b bg-background/80 p-3">
        <div className="space-y-2">
          {canManageGroup ? (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="h-8 min-w-0"
                onChange={(event) => onGroupNameDraftChange(group.id, event.target.value)}
                value={draftName ?? group.name}
              />
              <Button
                onClick={() => onRenameGroup(group, draftName ?? group.name)}
                size="sm"
                variant="outline"
              >
                保存
              </Button>
              <Button
                aria-label="删除组别"
                disabled={group.isDefault}
                onClick={() => onDeleteGroup(group)}
                size="icon"
                variant="ghost"
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ) : (
            <p className="font-medium">{group.name}</p>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Badge variant={group.isDefault ? "default" : "outline"}>
            {getGroupBadgeLabel(group)}
          </Badge>
          {group.isDefault || group.isVirtual ? (
            <span className="text-muted-foreground text-xs">{group.members.length} 人</span>
          ) : null}
          {isOver ? (
            <span className="text-primary text-xs">
              {group.isVirtual ? "松开移出此组" : "松开加入此组"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-x-hidden overflow-y-auto p-3">
        {group.members.length > 0 ? (
          group.members.map((member) => (
            // eslint-disable-next-line no-use-before-define -- 同文件卡片组件，保持列结构先出现
            <GroupMemberCard
              canUpdate={canManageGroup}
              groupId={group.id}
              isDraggable={canUpdate && !group.isVirtual}
              isVirtualGroup={Boolean(group.isVirtual)}
              key={member.id}
              member={member}
              onRemove={onRemoveGroupMember}
              onRoleChange={onRoleChange}
              pending={pending}
            />
          ))
        ) : (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-background/60 p-4 text-muted-foreground text-sm">
            {group.isVirtual ? "暂无未分组成员" : "拖拽成员到这里"}
          </div>
        )}
      </div>
    </section>
  );
}

interface MemberPoolCardProps {
  canUpdate: boolean;
  isOverlay?: boolean;
  row: MemberRow;
}

function MemberPoolCard({ canUpdate, isOverlay, row }: MemberPoolCardProps) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useDraggable({
      disabled: !canUpdate || isOverlay,
      id: getPoolDragId(row.userId),
    });
  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      className={`min-w-0 rounded-md border bg-background p-3 shadow-sm ${
        isOverlay ? "ring-2 ring-primary" : ""
      } ${isDragging ? "opacity-50" : ""}`}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label="拖动成员到其他组"
          className={`mt-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${
            isOverlay ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"
          }`}
          disabled={!canUpdate}
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-4" />
        </button>
        <MemberCell
          avatarSize="sm"
          className="flex-1 items-start gap-2"
          email={row.email}
          image={row.image}
          name={row.name}
        />
      </div>
    </div>
  );
}

interface GroupMemberCardProps {
  canUpdate: boolean;
  groupId: string;
  isDraggable?: boolean;
  isVirtualGroup?: boolean;
  member: RecruitingGroupMemberRow;
  onRemove: (groupId: string, member: RecruitingGroupMemberRow) => void;
  onRoleChange: (
    groupId: string,
    member: RecruitingGroupMemberRow,
    role: RecruitingGroupRole,
  ) => void;
  pending: string | null;
}

function GroupMemberCard({
  canUpdate,
  groupId,
  isDraggable = false,
  isVirtualGroup = false,
  member,
  onRemove,
  onRoleChange,
  pending,
}: GroupMemberCardProps) {
  const pendingKey = `${groupId}:${member.userId}`;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useDraggable({
      disabled: !isDraggable,
      id: getGroupMemberDragId(groupId, member.userId),
    });
  const style = {
    transform: CSS.Translate.toString(transform),
  };
  let roleControl = null;
  if (isVirtualGroup) {
    roleControl = <Badge variant="outline">未加入招聘组</Badge>;
  } else if (canUpdate && member.role) {
    roleControl = (
      <Select
        disabled={pending === pendingKey}
        onValueChange={(value) => onRoleChange(groupId, member, value as RecruitingGroupRole)}
        value={member.role}
      >
        <SelectTrigger className="h-8 w-full min-w-0" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUP_ROLE_OPTIONS.map((role) => (
            <SelectItem key={role} value={role}>
              {GROUP_ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (member.role) {
    roleControl = (
      <Badge variant={GROUP_ROLE_BADGE_VARIANT[member.role]}>
        {GROUP_ROLE_LABELS[member.role]}
      </Badge>
    );
  }

  return (
    <div
      className={`min-w-0 rounded-md border bg-background p-3 shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label="拖动组成员"
          className="mt-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!isDraggable}
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-4" />
        </button>
        <MemberCell
          avatarSize="sm"
          className="flex-1 items-start gap-2"
          email={member.email}
          image={member.image}
          name={member.name}
        />
        {canUpdate ? (
          <Button
            aria-label="移出招聘组"
            disabled={pending === pendingKey}
            onClick={() => onRemove(groupId, member)}
            size="icon"
            variant="ghost"
          >
            <IconTrash className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="mt-3">{roleControl}</div>
    </div>
  );
}

function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const workspaceMemberRole = useWorkspaceMemberRole() as WorkspaceRole;
  const routeSearch = useSearch({ from: "/w/$slug/studio/members" });
  const navigate = useNavigate({ from: "/w/$slug/studio/members" });
  const activeTab = parseWorkspaceManagementTab(routeSearch.tab);
  const {
    data: activeOrganization,
    refetch,
    isPending: isActiveOrganizationPending,
  } = authClient.useActiveOrganization();
  const org = getActiveWorkspaceOrganization(activeOrganization, workspaceId);
  const isPending = isActiveOrganizationPending || !org;
  const groupsQueryKey = ["workspace-recruiting-groups", slug, workspaceId] as const;
  const [pending, setPending] = useState<string | null>(null);
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");

  // 「最近活跃」按 userId 索引：服务端取 COALESCE(MAX(session.updatedAt),
  // user.lastActiveAt)——前者给当前活跃 session 5 分钟级的滚动更新，后者
  // 在登出/过期后兜底。详见 routes/studio/workspace/dao.ts。
  // Last-active map keyed by userId. The server returns
  // COALESCE(MAX(session.updatedAt), user.lastActiveAt) so logout/expiry
  // doesn't regress previously-seen users to "从未登录".
  const { data: lastActiveMap = {} } = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio.workspace["member-last-actives"].$get({
        param: { slug },
      });
      const payload = (await response.json()) as
        | { records: { userId: string; lastActiveAt: string | null }[] }
        | { message?: string };
      if (!response.ok || !("records" in payload)) {
        const message =
          "message" in payload ? (payload.message ?? "加载活跃时间失败") : "加载活跃时间失败";
        console.error("[member-last-actives]", response.status, message, payload);
        throw new Error(message);
      }
      return Object.fromEntries(
        payload.records.map((row) => [row.userId, row.lastActiveAt]),
      ) as Record<string, string | null>;
    },
    queryKey: ["workspace-member-last-actives", slug, workspaceId],
    refetchOnWindowFocus: false,
  });
  const { data: groups = EMPTY_RECRUITING_GROUPS, refetch: refetchGroups } = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio.workspace.groups.$get({
        param: { slug },
      });
      const payload = (await response.json()) as
        | { groups: RecruitingGroupRow[] }
        | { message?: string };
      if (!response.ok || !("groups" in payload)) {
        throw new Error("加载组别失败");
      }
      return payload.groups;
    },
    queryKey: groupsQueryKey,
    refetchOnWindowFocus: false,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<RecruitingGroupRow | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const isDeleteGroupDialogOpen = Boolean(deleteGroupTarget);
  const isDeletingGroup = Boolean(deletingGroupId);
  const canUpdate = useHasPermission("member", "update");
  const canDelete = useHasPermission("member", "delete");
  const canUpdateWorkspace = useHasPermission("organization", "update");
  const { data: session } = authClient.useSession();
  const { data: dynamicWorkspaceRoles = [] } = useDynamicWorkspaceRoles(workspaceId, canUpdate);

  function handleTabChange(value: string) {
    const tab = parseWorkspaceManagementTab(value);
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: WorkspaceManagementSearch) => buildWorkspaceManagementSearch(prev, tab),
    });
  }

  // 当前用户在这个 org 的角色——决定 Select 给出哪些可选项 + 哪些行只读。
  // 服务端硬约束已经在 beforeUpdateMemberRole hook 里执行；这里 UI 同步
  // 同一套规则给出即时反馈，并隐藏不可达的选项。
  // Current user's role inside this org — drives which options the Select
  // shows and which rows render as read-only. The server-side hook is the
  // real boundary; this is the matching UX.
  const currentMemberRole = workspaceMemberRole;
  const assignableRoles = useMemo<readonly string[]>(
    () => buildAssignableWorkspaceRoles(currentMemberRole, dynamicWorkspaceRoles),
    [currentMemberRole, dynamicWorkspaceRoles],
  );
  const assignableRoleOptions = useMemo(
    () => buildWorkspaceRoleOptions(assignableRoles, dynamicWorkspaceRoles),
    [assignableRoles, dynamicWorkspaceRoles],
  );

  const allRows: MemberRow[] = useMemo(() => {
    const list = org?.members ?? [];
    return list.map((m) => {
      const { user } = m as {
        user?: { email?: string; name?: string; image?: string | null };
      };
      return {
        createdAt: m.createdAt as string | Date,
        email: user?.email ?? "—",
        id: m.id,
        image: user?.image ?? null,
        lastActiveAt: lastActiveMap[m.userId] ?? null,
        name: user?.name ?? user?.email ?? "—",
        role: m.role,
        userId: m.userId,
      };
    });
  }, [org?.members, lastActiveMap]);

  useEffect(() => {
    setGroupNameDrafts((current) => {
      const next = Object.fromEntries(
        groups.map((group) => [group.id, current[group.id] ?? group.name]),
      );
      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      if (
        currentKeys.length === nextKeys.length &&
        nextKeys.every((key) => current[key] === next[key])
      ) {
        return current;
      }
      return next;
    });
  }, [groups]);

  // 成员列表来自 authClient.useActiveOrganization() 内存数据,这里做客户端切片
  // 让分页 UI 跟其他 studio 页面 (服务端分页) 视觉一致。
  // total <= pageSize 时 totalPages 仍是 1, DataGrid 会隐藏页码控件。
  const total = allRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = useMemo(
    () => allRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [allRows, safePage, pageSize],
  );

  async function createGroup() {
    const name = normalizeGroupName(newGroupName);
    if (!name) {
      return;
    }
    if (hasDuplicateGroupName(groups, name)) {
      toast.error("同一工作区内已存在同名招聘组");
      return;
    }
    const response = await rpc.api.w[":slug"].studio.workspace.groups.$post({
      json: { name },
      param: { slug },
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response, "创建组别失败"));
      return;
    }
    setNewGroupName("");
    await refetchGroups();
    toast.success("组别已创建");
  }

  async function renameGroup(group: RecruitingGroupRow, draftName: string) {
    if (group.isVirtual) {
      return;
    }
    const name = normalizeGroupName(draftName);
    if (!name || name === group.name) {
      return;
    }
    if (hasDuplicateGroupName(groups, name, group.id)) {
      toast.error("同一工作区内已存在同名招聘组");
      return;
    }
    const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].$patch({
      json: { name },
      param: { id: group.id, slug },
    });
    if (!response.ok) {
      toast.error(await readErrorMessage(response, "更新组别失败"));
      return;
    }
    await refetchGroups();
    toast.success("组别已更新");
  }

  async function deleteGroup(group: RecruitingGroupRow) {
    setDeletingGroupId(group.id);
    try {
      const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].$delete({
        param: { id: group.id, slug },
      });
      if (!response.ok) {
        toast.error("删除组别失败");
        return;
      }
      setDeleteGroupTarget(null);
      await refetchGroups();
      toast.success("组别已删除，组内成员关系已移除");
    } catch {
      toast.error("删除组别失败");
    } finally {
      setDeletingGroupId(null);
    }
  }

  async function addMemberToGroup(row: MemberRow, groupId: string) {
    const pendingKey = `${groupId}:${row.userId}`;
    setPending(pendingKey);
    try {
      const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].members.$post({
        json: { role: DEFAULT_NEW_GROUP_MEMBER_ROLE, userId: row.userId },
        param: { id: groupId, slug },
      });
      if (!response.ok) {
        toast.error(await readErrorMessage(response, "添加组成员失败"));
        return;
      }
      await refetchGroups();
      toast.success("成员已加入招聘组");
    } catch {
      toast.error("添加组成员失败");
    } finally {
      setPending(null);
    }
  }

  async function moveMemberToGroup(row: MemberRow, sourceGroupId: string, targetGroupId: string) {
    const pendingKey = `${sourceGroupId}:${row.userId}`;
    setPending(pendingKey);
    try {
      const removeResponse = await rpc.api.w[":slug"].studio.workspace.groups[":id"].members[
        ":userId"
      ].$delete({
        param: { id: sourceGroupId, slug, userId: row.userId },
      });
      if (!removeResponse.ok) {
        toast.error(await readErrorMessage(removeResponse, "移动组成员失败"));
        await refetchGroups();
        return;
      }

      const addResponse = await rpc.api.w[":slug"].studio.workspace.groups[":id"].members.$post({
        json: { role: DEFAULT_NEW_GROUP_MEMBER_ROLE, userId: row.userId },
        param: { id: targetGroupId, slug },
      });
      if (!addResponse.ok) {
        toast.error(await readErrorMessage(addResponse, "移动组成员失败"));
        await refetchGroups();
        return;
      }

      await refetchGroups();
      toast.success("成员已移动到目标招聘组");
    } catch {
      toast.error("移动组成员失败");
    } finally {
      setPending(null);
    }
  }

  async function changeGroupMemberRole(
    groupId: string,
    member: RecruitingGroupMemberRow,
    role: RecruitingGroupRole,
  ) {
    const pendingKey = `${groupId}:${member.userId}`;
    setPending(pendingKey);
    try {
      const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].members[
        ":userId"
      ].$patch({
        json: { role },
        param: { id: groupId, slug, userId: member.userId },
      });
      if (!response.ok) {
        toast.error("更新组内角色失败");
        return;
      }
      await refetchGroups();
      toast.success("组内角色已更新");
    } catch {
      toast.error("更新组内角色失败");
    } finally {
      setPending(null);
    }
  }

  async function removeGroupMember(groupId: string, member: RecruitingGroupMemberRow) {
    const pendingKey = `${groupId}:${member.userId}`;
    setPending(pendingKey);
    try {
      const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].members[
        ":userId"
      ].$delete({
        param: { id: groupId, slug, userId: member.userId },
      });
      if (!response.ok) {
        toast.error("移出招聘组失败");
        return;
      }
      await refetchGroups();
      toast.success("成员已移出招聘组");
    } catch {
      toast.error("移出招聘组失败");
    } finally {
      setPending(null);
    }
  }

  async function changeWorkspaceRole(row: MemberRow, role: string) {
    if (row.role === role) {
      return;
    }
    setPending(row.id);
    const { error } = await authClient.organization.updateMemberRole({
      memberId: row.id,
      role: role as "admin" | "member",
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "更新工作区角色失败");
      return;
    }
    await refetch();
    toast.success("工作区角色已更新");
  }

  function removeMember(row: MemberRow) {
    toast(`确认移除「${row.email}」？`, {
      action: {
        label: "确认移除",
        onClick: async () => {
          setPending(row.id);
          const { error } = await authClient.organization.removeMember({
            memberIdOrEmail: row.id,
          });
          setPending(null);
          if (error) {
            toast.error(error.message ?? "移除成员失败");
            return;
          }
          await refetch();
          toast.success("成员已移除");
        },
      },
    });
  }

  const columns = useMemo(
    () => [
      customColumn<MemberRow>({
        cell: (r) => (
          <MemberCell
            avatarSize="sm"
            className="gap-3"
            email={r.email}
            image={r.image}
            name={r.name}
          />
        ),
        key: "name",
        title: "成员",
      }),
      customColumn<MemberRow>({
        cell: (r) => {
          const canEditWorkspaceRole = canEditMemberWorkspaceRole({
            assignableRoles,
            canUpdate,
            currentRole: currentMemberRole,
            currentUserId: session?.user?.id,
            row: r,
          });
          if (!canEditWorkspaceRole) {
            return (
              <Badge variant={getWorkspaceRoleBadgeVariant(r.role)}>
                {getWorkspaceRoleLabel(r.role)}
              </Badge>
            );
          }
          return (
            <Select
              disabled={pending === r.id}
              onValueChange={(value) => void changeWorkspaceRole(r, value)}
              value={r.role}
            >
              <SelectTrigger className="w-36" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
        key: "role",
        size: 150,
        title: "工作区角色",
      }),
      customColumn<MemberRow>({
        cell: (r) => (
          <span className="text-muted-foreground text-sm">
            <TimeDisplay value={r.createdAt} />
          </span>
        ),
        key: "createdAt",
        title: "加入时间",
      }),
      customColumn<MemberRow>({
        cell: (r) =>
          r.lastActiveAt ? (
            <span className="text-muted-foreground text-sm">
              <TimeDisplay value={r.lastActiveAt} />
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">从未登录</span>
          ),
        key: "lastActiveAt",
        title: "最近活跃",
      }),
      actionsColumn<MemberRow>({
        menu: canDelete
          ? [
              {
                label: "移除成员",
                onClick: (r) => removeMember(r),
                variant: "destructive",
              },
            ]
          : [],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 列定义只依赖权限值，剧场切换时无需重建
    [assignableRoles, canDelete, canUpdate, currentMemberRole, pending, session?.user?.id],
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-6">
      <PageHeader
        description="维护工作区成员、邀请入口和招聘组身份，让招聘协作边界清晰可控。"
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="truncate">{org?.name ?? "工作区"}</span>
            {org && canUpdateWorkspace ? (
              <WorkspaceSettingsDialog
                currentName={org.name}
                trigger={
                  <Button aria-label="工作区设置" size="icon" variant="ghost">
                    <IconSettings />
                  </Button>
                }
              />
            ) : null}
          </span>
        }
      />

      <Tabs className="space-y-4" onValueChange={handleTabChange} value={activeTab}>
        <TabsList className="grid w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="members">成员</TabsTrigger>
          <TabsTrigger value="groups">招聘组</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-0" value="members">
          <DataGrid<MemberRow>
            columns={columns}
            data={rows}
            empty={
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUsers className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>暂无成员</EmptyTitle>
                  <EmptyDescription>
                    邀请同事加入这个工作区，再到招聘组看板里分配组内身份。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <PermissionGate action="create" resource="invitation">
                    <InviteDialog
                      assignableRoleOptions={assignableRoleOptions}
                      assignableRoles={assignableRoles}
                      trigger={
                        <Button>
                          <IconUserPlus className="size-4" />
                          邀请成员
                        </Button>
                      }
                    />
                  </PermissionGate>
                </EmptyContent>
              </Empty>
            }
            getRowId={(r) => r.id}
            loading={isPending}
            pagination={{
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
              page: safePage,
              pageSize,
            }}
            toolbarRight={
              <div className="flex flex-wrap gap-2">
                <PermissionGate action="create" resource="invitation">
                  <PendingInvitationsButton organizationId={org?.id ?? null} />
                </PermissionGate>
                <PermissionGate action="create" resource="invitation">
                  <InviteLinksDialog
                    assignableRoleOptions={assignableRoleOptions}
                    assignableRoles={assignableRoles}
                  />
                  <InviteDialog
                    assignableRoleOptions={assignableRoleOptions}
                    assignableRoles={assignableRoles}
                    trigger={
                      <Button>
                        <IconUserPlus className="size-4" />
                        邀请成员
                      </Button>
                    }
                  />
                </PermissionGate>
              </div>
            }
            total={total}
            totalPages={totalPages}
          />
        </TabsContent>

        <TabsContent className="mt-0" value="groups">
          <RecruitingGroupsPanel
            allRows={allRows}
            canUpdate={canUpdate}
            groupNameDrafts={groupNameDrafts}
            groups={groups}
            newGroupName={newGroupName}
            onAddMemberToGroup={(row, groupId) => void addMemberToGroup(row, groupId)}
            onCreateGroup={() => void createGroup()}
            onDeleteGroup={setDeleteGroupTarget}
            onGroupNameDraftChange={(groupId, value) =>
              setGroupNameDrafts((current) => ({ ...current, [groupId]: value }))
            }
            onRemoveGroupMember={(groupId, member) => void removeGroupMember(groupId, member)}
            onRenameGroup={(group, name) => void renameGroup(group, name)}
            onMoveMemberToGroup={(row, sourceGroupId, targetGroupId) =>
              void moveMemberToGroup(row, sourceGroupId, targetGroupId)
            }
            onRoleChange={(groupId, member, role) =>
              void changeGroupMemberRole(groupId, member, role)
            }
            pending={pending}
            setNewGroupName={setNewGroupName}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        onOpenChange={(open) => {
          if (open || isDeletingGroup) {
            return;
          }
          setDeleteGroupTarget(null);
        }}
        open={isDeleteGroupDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这个招聘组？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后仅移除该组内的成员关系，不会移除工作区成员。当前组别：
              {deleteGroupTarget?.name ?? "未知组别"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingGroup}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingGroup}
              onClick={(event) => {
                event.preventDefault();
                if (deleteGroupTarget) {
                  void deleteGroup(deleteGroupTarget);
                }
              }}
              variant="destructive"
            >
              {isDeletingGroup ? "正在删除…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/members")({
  component: MembersManagementPage,
  head: () => ({
    meta: [{ title: "工作区管理" }],
  }),
  validateSearch: (search: Record<string, unknown>) => coerceWorkspaceManagementSearch(search),
});
