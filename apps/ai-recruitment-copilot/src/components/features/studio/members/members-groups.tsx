import { IconGripVertical, IconPlus, IconTrash } from "@tabler/icons-react";
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

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { GROUP_ROLE_BADGE_VARIANT, GROUP_ROLE_LABELS } from "./members-page-model";
import type {
  MemberRow,
  RecruitingGroupMemberRow,
  RecruitingGroupRole,
  RecruitingGroupRow,
} from "./members-page-model";
const GROUP_ROLE_OPTIONS = [
  "recruitingSupervisor",
  "recruitingLead",
  "hr",
  "viewer",
] as const satisfies readonly RecruitingGroupRole[];

const groupRoleSchema = z.enum(GROUP_ROLE_OPTIONS);
const errorPayloadSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

export const DEFAULT_NEW_GROUP_MEMBER_ROLE = "hr" satisfies RecruitingGroupRole;

const recruitingGroupCollisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    return pointerWithin(args);
  }
  return closestCorners(args);
};

export function normalizeGroupName(value: string) {
  return value.trim();
}

export function hasDuplicateGroupName(
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

export async function readErrorMessage(response: Response, fallback: string) {
  const payload = errorPayloadSchema.safeParse(await response.json().catch(() => null));
  return payload.success ? (payload.data.error ?? payload.data.message ?? fallback) : fallback;
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

export function RecruitingGroupsPanel({
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
      className={`min-w-0 rounded-md border bg-background p-3 ${
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
        onValueChange={(value) => {
          const role = groupRoleSchema.safeParse(value);
          if (role.success) {
            onRoleChange(groupId, member, role.data);
          }
        }}
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
      className={`min-w-0 rounded-md border bg-background p-3 ${isDragging ? "opacity-50" : ""}`}
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
