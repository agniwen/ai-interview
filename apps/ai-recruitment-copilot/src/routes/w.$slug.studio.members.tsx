import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/studio/page-header";
import { actionsColumn, customColumn, DataGrid } from "@/components/data-grid";
import { PermissionGate } from "@/components/permission/permission-gate";
import { TimeDisplay } from "@/components/display/time-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { InviteDialog } from "@/components/studio/members/invite-dialog";
import { InviteLinksDialog } from "@/components/studio/members/invite-links-dialog";
import { PendingInvitationsButton } from "@/components/studio/members/pending-invitations-section";
import { PermissionsExplanationDialog } from "@/components/studio/members/permissions-explanation-dialog";
import {
  getAssignableWorkspaceRoles,
  getWorkspaceRoleLabel,
} from "@/components/studio/members/role-display";
import type { WorkspaceRole } from "@/components/studio/members/role-display";
import { WorkspaceSettingsDialog } from "@/components/studio/members/workspace-settings-dialog";

const DEFAULT_PAGE_SIZE = 10;

interface MemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: WorkspaceRole;
  groupId: string | null;
  groupName: string | null;
  createdAt: string | Date;
  lastActiveAt: string | null;
}

interface RecruitingGroupRow {
  id: string;
  name: string;
  createdAt: string;
  memberUserIds: string[];
}

const EMPTY_RECRUITING_GROUPS: RecruitingGroupRow[] = [];
const WHITESPACE_REGEX = /\s+/u;

function getInitials(name?: string | null, email?: string | null) {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(WHITESPACE_REGEX).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  hr: "secondary",
  owner: "default",
  recruitingLead: "secondary",
  recruitingSupervisor: "secondary",
  viewer: "outline",
};

const NO_GROUP_VALUE = "__none";
const ALL_GROUPS_VALUE = "__all";
const UNGROUPED_COLUMN_ID = "group:__none";
const DEFAULT_GROUP_LABEL = "默认分组";

function getColumnId(groupId: string | null) {
  return groupId ? `group:${groupId}` : UNGROUPED_COLUMN_ID;
}

function getGroupIdFromColumnId(columnId: string) {
  return columnId === UNGROUPED_COLUMN_ID ? null : columnId.replace(/^group:/u, "");
}

interface RecruitingGroupsPanelProps {
  allRows: MemberRow[];
  assignableRoles: readonly WorkspaceRole[];
  canUpdate: boolean;
  currentMemberRole: WorkspaceRole | null;
  currentUserId: string | undefined;
  groupNameDrafts: Record<string, string>;
  groups: RecruitingGroupRow[];
  newGroupName: string;
  onCreateGroup: () => void;
  onDeleteGroup: (group: RecruitingGroupRow) => void;
  onGroupNameDraftChange: (groupId: string, value: string) => void;
  onMoveMember: (row: MemberRow, groupId: string | null) => void;
  onRenameGroup: (group: RecruitingGroupRow, name: string) => void;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  pending: string | null;
  setNewGroupName: (value: string) => void;
  ungroupedRows: MemberRow[];
}

function RecruitingGroupsPanel({
  allRows,
  assignableRoles,
  canUpdate,
  currentMemberRole,
  currentUserId,
  groupNameDrafts,
  groups,
  newGroupName,
  onCreateGroup,
  onDeleteGroup,
  onGroupNameDraftChange,
  onMoveMember,
  onRenameGroup,
  onRoleChange,
  pending,
  setNewGroupName,
  ungroupedRows,
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
    const row = allRows.find((item) => item.userId === String(event.active.id));
    const overId = event.over?.id;
    if (!row || !overId) {
      return;
    }
    const nextGroupId = getGroupIdFromColumnId(String(overId));
    if (row.groupId === nextGroupId) {
      return;
    }
    onMoveMember(row, nextGroupId);
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">招聘组看板</p>
          <p className="text-muted-foreground text-sm">
            拖拽成员卡片调整组别，在卡片内直接设置角色。
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
              <PlusIcon className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <DndContext
        collisionDetection={closestCorners}
        onDragCancel={() => setActiveUserId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={(event) => setActiveUserId(String(event.active.id))}
        sensors={sensors}
      >
        <div className="min-w-0 max-w-full">
          <div className="flex max-w-full gap-4 overflow-x-auto overscroll-x-contain px-px pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* eslint-disable-next-line no-use-before-define -- 同文件看板子组件，保持面板主结构先出现 */}
            <RecruitingGroupColumn
              assignableRoles={assignableRoles}
              canUpdate={canUpdate}
              currentMemberRole={currentMemberRole}
              currentUserId={currentUserId}
              id={UNGROUPED_COLUMN_ID}
              pending={pending}
              rows={ungroupedRows}
              title={DEFAULT_GROUP_LABEL}
              onRoleChange={onRoleChange}
            />
            {groups.map((group) => (
              // eslint-disable-next-line no-use-before-define -- 同文件看板子组件，保持面板主结构先出现
              <RecruitingGroupColumn
                assignableRoles={assignableRoles}
                canUpdate={canUpdate}
                currentMemberRole={currentMemberRole}
                currentUserId={currentUserId}
                draftName={groupNameDrafts[group.id] ?? group.name}
                group={group}
                id={getColumnId(group.id)}
                key={group.id}
                onDeleteGroup={onDeleteGroup}
                onGroupNameDraftChange={onGroupNameDraftChange}
                onRenameGroup={onRenameGroup}
                onRoleChange={onRoleChange}
                pending={pending}
                rows={allRows.filter((row) => row.groupId === group.id)}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeRow ? (
            // eslint-disable-next-line no-use-before-define -- 同文件卡片组件，保持拖拽面板主结构先出现
            <MemberCard
              assignableRoles={assignableRoles}
              canUpdate={canUpdate}
              currentMemberRole={currentMemberRole}
              currentUserId={currentUserId}
              isOverlay
              onRoleChange={onRoleChange}
              pending={pending}
              row={activeRow}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface RecruitingGroupColumnProps {
  assignableRoles: readonly WorkspaceRole[];
  canUpdate: boolean;
  currentMemberRole: WorkspaceRole | null;
  currentUserId: string | undefined;
  draftName?: string;
  group?: RecruitingGroupRow;
  id: string;
  onDeleteGroup?: (group: RecruitingGroupRow) => void;
  onGroupNameDraftChange?: (groupId: string, value: string) => void;
  onRenameGroup?: (group: RecruitingGroupRow, name: string) => void;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  pending: string | null;
  rows: MemberRow[];
  title?: string;
}

function RecruitingGroupColumn({
  assignableRoles,
  canUpdate,
  currentMemberRole,
  currentUserId,
  draftName,
  group,
  id,
  onDeleteGroup,
  onGroupNameDraftChange,
  onRenameGroup,
  onRoleChange,
  pending,
  rows,
  title,
}: RecruitingGroupColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled: !canUpdate,
    id,
  });

  return (
    <section
      className={`flex max-h-[680px] min-h-96 w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-muted/25 transition-colors ${
        isOver ? "border-primary bg-primary/5" : ""
      }`}
      ref={setNodeRef}
    >
      <div className="space-y-3 border-b bg-background/80 p-3">
        {group ? (
          <div className="space-y-2">
            {canUpdate ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  className="h-8 min-w-0"
                  onChange={(event) => onGroupNameDraftChange?.(group.id, event.target.value)}
                  value={draftName ?? group.name}
                />
                <Button
                  onClick={() => onRenameGroup?.(group, draftName ?? group.name)}
                  size="sm"
                  variant="outline"
                >
                  保存
                </Button>
                <Button
                  aria-label="删除组别"
                  onClick={() => onDeleteGroup?.(group)}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ) : (
              <p className="font-medium">{group.name}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="font-medium">{title}</p>
            <p className="text-muted-foreground text-xs">默认分组同样按角色层级控制可见范围</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <Badge variant="outline">{rows.length} 人</Badge>
          {isOver ? <span className="text-primary text-xs">松开移动到这里</span> : null}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-x-hidden overflow-y-auto p-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            // eslint-disable-next-line no-use-before-define -- 同文件卡片组件，保持列结构先出现
            <MemberCard
              assignableRoles={assignableRoles}
              canUpdate={canUpdate}
              currentMemberRole={currentMemberRole}
              currentUserId={currentUserId}
              key={row.userId}
              onRoleChange={onRoleChange}
              pending={pending}
              row={row}
            />
          ))
        ) : (
          <div className="flex min-h-28 items-center justify-center rounded-md border border-dashed bg-background/60 p-4 text-muted-foreground text-sm">
            拖拽成员到这里
          </div>
        )}
      </div>
    </section>
  );
}

interface MemberCardProps {
  assignableRoles: readonly WorkspaceRole[];
  canUpdate: boolean;
  currentMemberRole: WorkspaceRole | null;
  currentUserId: string | undefined;
  isOverlay?: boolean;
  onRoleChange: (memberId: string, role: WorkspaceRole) => void;
  pending: string | null;
  row: MemberRow;
}

function MemberCard({
  assignableRoles,
  canUpdate,
  currentMemberRole,
  currentUserId,
  isOverlay,
  onRoleChange,
  pending,
  row,
}: MemberCardProps) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useDraggable({
      disabled: !canUpdate || isOverlay,
      id: row.userId,
    });
  const isOwnerRow = row.role === "owner";
  const isAdminEditingSelf = currentMemberRole === "admin" && row.userId === currentUserId;
  const isAdminEditingAdmin = currentMemberRole === "admin" && row.role === "admin";
  const canEditRole = canUpdate && !isOwnerRow && !isAdminEditingSelf && !isAdminEditingAdmin;
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
          <GripVerticalIcon className="size-4" />
        </button>
        <Avatar size="sm">
          <AvatarImage alt={row.name} src={row.image ?? undefined} />
          <AvatarFallback>{getInitials(row.name, row.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{row.name}</p>
          <p className="truncate text-muted-foreground text-xs">{row.email}</p>
        </div>
      </div>
      <div className="mt-3">
        {canEditRole ? (
          <Select
            disabled={pending === row.id}
            onValueChange={(value) => onRoleChange(row.id, value as WorkspaceRole)}
            value={row.role}
          >
            <SelectTrigger className="h-8 w-full min-w-0" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {getWorkspaceRoleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={ROLE_BADGE_VARIANT[row.role]}>{getWorkspaceRoleLabel(row.role)}</Badge>
        )}
      </div>
    </div>
  );
}

function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const { data: org, refetch, isPending } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();
  const groupsQueryKey = ["workspace-recruiting-groups", slug, org?.id] as const;
  const [pending, setPending] = useState<string | null>(null);
  const [memberGroupFilter, setMemberGroupFilter] = useState(ALL_GROUPS_VALUE);
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");

  // 「最近活跃」按 userId 索引：服务端取 COALESCE(MAX(session.updatedAt),
  // user.lastActiveAt)——前者给当前活跃 session 5 分钟级的滚动更新，后者
  // 在登出/过期后兜底。详见 routes/studio/workspace/dao.ts。
  // Last-active map keyed by userId. The server returns
  // COALESCE(MAX(session.updatedAt), user.lastActiveAt) so logout/expiry
  // doesn't regress previously-seen users to "从未登录".
  const { data: lastActiveMap = {} } = useQuery({
    enabled: Boolean(org?.id),
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
    queryKey: ["workspace-member-last-actives", slug, org?.id],
    refetchOnWindowFocus: false,
  });
  const { data: groups = EMPTY_RECRUITING_GROUPS, refetch: refetchGroups } = useQuery({
    enabled: Boolean(org?.id),
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

  // 当前用户在这个 org 的角色——决定 Select 给出哪些可选项 + 哪些行只读。
  // 服务端硬约束已经在 beforeUpdateMemberRole hook 里执行；这里 UI 同步
  // 同一套规则给出即时反馈，并隐藏不可达的选项。
  // Current user's role inside this org — drives which options the Select
  // shows and which rows render as read-only. The server-side hook is the
  // real boundary; this is the matching UX.
  const currentMemberRole = useMemo<WorkspaceRole | null>(() => {
    const list = org?.members ?? [];
    const me = list.find((m) => m.userId === currentUserId);
    return (me?.role as WorkspaceRole | undefined) ?? null;
  }, [org?.members, currentUserId]);
  const assignableRoles = useMemo<readonly WorkspaceRole[]>(
    () => getAssignableWorkspaceRoles(currentMemberRole),
    [currentMemberRole],
  );

  const allRows: MemberRow[] = useMemo(() => {
    const list = org?.members ?? [];
    const groupByUserId = new Map<string, RecruitingGroupRow>();
    for (const group of groups) {
      for (const userId of group.memberUserIds) {
        groupByUserId.set(userId, group);
      }
    }
    return list.map((m) => {
      const { user } = m as {
        user?: { email?: string; name?: string; image?: string | null };
      };
      const group = groupByUserId.get(m.userId) ?? null;
      return {
        createdAt: m.createdAt as string | Date,
        email: user?.email ?? "—",
        groupId: group?.id ?? null,
        groupName: group?.name ?? null,
        id: m.id,
        image: user?.image ?? null,
        lastActiveAt: lastActiveMap[m.userId] ?? null,
        name: user?.name ?? user?.email ?? "—",
        role: m.role as WorkspaceRole,
        userId: m.userId,
      };
    });
  }, [org?.members, groups, lastActiveMap]);

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

  const filteredRows = useMemo(() => {
    if (memberGroupFilter === ALL_GROUPS_VALUE) {
      return allRows;
    }
    if (memberGroupFilter === NO_GROUP_VALUE) {
      return allRows.filter((row) => !row.groupId);
    }
    return allRows.filter((row) => row.groupId === memberGroupFilter);
  }, [allRows, memberGroupFilter]);

  // 成员列表来自 authClient.useActiveOrganization() 内存数据,这里做客户端切片
  // 让分页 UI 跟其他 studio 页面 (服务端分页) 视觉一致。
  // total <= pageSize 时 totalPages 仍是 1, DataGrid 会隐藏页码控件。
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize],
  );

  async function changeRole(memberId: string, role: WorkspaceRole) {
    setPending(memberId);
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role: role as "owner" | "admin" | "recruitingSupervisor" | "recruitingLead" | "hr" | "viewer",
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "更新角色失败");
      return;
    }
    await refetch();
    toast.success("角色已更新");
  }

  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) {
      return;
    }
    const response = await rpc.api.w[":slug"].studio.workspace.groups.$post({
      json: { name },
      param: { slug },
    });
    if (!response.ok) {
      toast.error("创建组别失败");
      return;
    }
    setNewGroupName("");
    await refetchGroups();
    toast.success("组别已创建");
  }

  async function renameGroup(group: RecruitingGroupRow, draftName: string) {
    const name = draftName.trim();
    if (!name || name === group.name) {
      return;
    }
    const response = await rpc.api.w[":slug"].studio.workspace.groups[":id"].$patch({
      json: { name },
      param: { id: group.id, slug },
    });
    if (!response.ok) {
      toast.error("更新组别失败");
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
      setMemberGroupFilter(ALL_GROUPS_VALUE);
      setDeleteGroupTarget(null);
      await refetchGroups();
      toast.success(`组别已删除，成员已移入${DEFAULT_GROUP_LABEL}`);
    } catch {
      toast.error("删除组别失败");
    } finally {
      setDeletingGroupId(null);
    }
  }

  async function changeGroup(row: MemberRow, value: string | null) {
    setPending(row.id);
    const groupId = value === NO_GROUP_VALUE ? null : value;
    await queryClient.cancelQueries({ queryKey: groupsQueryKey });
    const previousGroups = queryClient.getQueryData<RecruitingGroupRow[]>(groupsQueryKey);
    queryClient.setQueryData<RecruitingGroupRow[]>(groupsQueryKey, (currentGroups = []) =>
      currentGroups.map((group) => {
        const memberUserIds = group.memberUserIds.filter((userId) => userId !== row.userId);
        return {
          ...group,
          memberUserIds:
            group.id === groupId ? [...new Set([...memberUserIds, row.userId])] : memberUserIds,
        };
      }),
    );
    try {
      const response = await rpc.api.w[":slug"].studio.workspace.members[":userId"].group.$patch({
        json: { groupId },
        param: { slug, userId: row.userId },
      });
      if (!response.ok) {
        queryClient.setQueryData(groupsQueryKey, previousGroups);
        toast.error("更新组别失败");
        return;
      }
      void refetchGroups();
      toast.success("组别已更新");
    } catch {
      queryClient.setQueryData(groupsQueryKey, previousGroups);
      toast.error("更新组别失败");
    } finally {
      setPending(null);
    }
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
          <div className="flex items-center gap-3 min-w-0">
            <Avatar size="sm">
              <AvatarImage alt={r.name} src={r.image ?? undefined} />
              <AvatarFallback>{getInitials(r.name, r.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <p className="truncate text-muted-foreground text-xs">{r.email}</p>
            </div>
          </div>
        ),
        key: "name",
        title: "成员",
      }),
      customColumn<MemberRow>({
        cell: (r) => {
          // 渲染为只读 Badge 的几种情况：
          //   1. 当前用户没有 member.update 权限（非管理角色）。
          //   2. 这一行是 owner—— owner 的角色不在本表单处理（走 transferOwnership）。
          //   3. 当前用户是 admin 且这一行是自己——admin 不能改自己的角色。
          //   4. 当前用户是 admin 且这一行是另一个 admin——admin 不能改其他 admin。
          // owner 改自己的早被规则 2 包住了（owner 改 owner = 改自己也是 owner，
          // 落入"该行是 owner"路径）。
          // Read-only render branches: no permission / target is owner / admin
          // editing self / admin editing another admin. Owner editing self is
          // already covered by the "target is owner" branch.
          const isOwnerRow = r.role === "owner";
          const isAdminEditingSelf = currentMemberRole === "admin" && r.userId === currentUserId;
          const isAdminEditingAdmin = currentMemberRole === "admin" && r.role === "admin";
          if (!canUpdate || isOwnerRow || isAdminEditingSelf || isAdminEditingAdmin) {
            return (
              <Badge variant={ROLE_BADGE_VARIANT[r.role]}>{getWorkspaceRoleLabel(r.role)}</Badge>
            );
          }
          return (
            <Select
              disabled={pending === r.id}
              onValueChange={(v) => void changeRole(r.id, v as WorkspaceRole)}
              value={r.role}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getWorkspaceRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
        key: "role",
        size: 160,
        title: "角色",
      }),
      customColumn<MemberRow>({
        cell: (r) =>
          canUpdate ? (
            <Select
              disabled={pending === r.id}
              onValueChange={(value) => void changeGroup(r, value)}
              value={r.groupId ?? NO_GROUP_VALUE}
            >
              <SelectTrigger className="w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP_VALUE}>{DEFAULT_GROUP_LABEL}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{r.groupName ?? DEFAULT_GROUP_LABEL}</Badge>
          ),
        key: "group",
        size: 150,
        title: "组别",
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
    [canUpdate, canDelete, pending, currentUserId, currentMemberRole, assignableRoles, groups],
  );

  const ungroupedRows = useMemo(() => allRows.filter((row) => !row.groupId), [allRows]);

  return (
    <div className="space-y-6">
      <PageHeader
        description="维护工作区成员、角色和邀请入口，让招聘协作的权限边界清晰可控。"
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="truncate">{org?.name ?? "工作区"}</span>
            {org && canUpdateWorkspace ? (
              <WorkspaceSettingsDialog
                currentName={org.name}
                trigger={
                  <Button aria-label="工作区设置" size="icon" variant="ghost">
                    <SettingsIcon />
                  </Button>
                }
              />
            ) : null}
          </span>
        }
      />

      <Tabs className="space-y-4" defaultValue="members">
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
                    <UsersIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>暂无成员</EmptyTitle>
                  <EmptyDescription>
                    邀请同事加入这个工作区，按角色分配管理员、招聘主管、招聘组长、招聘成员或只读成员权限。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <PermissionGate action="create" resource="invitation">
                    <InviteDialog
                      assignableRoles={assignableRoles}
                      trigger={
                        <Button>
                          <UserPlusIcon className="size-4" />
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
                <Select
                  onValueChange={(value) => {
                    setMemberGroupFilter(value);
                    setPage(1);
                  }}
                  value={memberGroupFilter}
                >
                  <SelectTrigger className="w-36" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_GROUPS_VALUE}>全部组别</SelectItem>
                    <SelectItem value={NO_GROUP_VALUE}>{DEFAULT_GROUP_LABEL}</SelectItem>
                    {groups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PermissionsExplanationDialog />
                <PermissionGate action="create" resource="invitation">
                  <PendingInvitationsButton organizationId={org?.id ?? null} />
                </PermissionGate>
                <PermissionGate action="create" resource="invitation">
                  <InviteLinksDialog />
                  <InviteDialog
                    assignableRoles={assignableRoles}
                    trigger={
                      <Button>
                        <UserPlusIcon className="size-4" />
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
            assignableRoles={assignableRoles}
            canUpdate={canUpdate}
            currentMemberRole={currentMemberRole}
            currentUserId={currentUserId}
            groupNameDrafts={groupNameDrafts}
            groups={groups}
            newGroupName={newGroupName}
            onCreateGroup={() => void createGroup()}
            onDeleteGroup={setDeleteGroupTarget}
            onGroupNameDraftChange={(groupId, value) =>
              setGroupNameDrafts((current) => ({ ...current, [groupId]: value }))
            }
            onMoveMember={(row, groupId) => void changeGroup(row, groupId)}
            onRenameGroup={(group, name) => void renameGroup(group, name)}
            onRoleChange={(memberId, role) => void changeRole(memberId, role)}
            pending={pending}
            setNewGroupName={setNewGroupName}
            ungroupedRows={ungroupedRows}
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
              删除后，组内成员会移入{DEFAULT_GROUP_LABEL}。当前组别：
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
});
