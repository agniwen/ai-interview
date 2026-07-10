import { IconSettings, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
} from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { WorkspaceSettingsDialog } from "@/components/features/studio/members/workspace-settings-dialog";

import {
  DEFAULT_PAGE_SIZE,
  buildAssignableWorkspaceRoles,
  buildWorkspaceManagementSearch,
  canEditMemberWorkspaceRole,
  getWorkspaceRoleBadgeVariant,
  parseWorkspaceManagementTab,
  useDynamicWorkspaceRoles,
  EMPTY_RECRUITING_GROUPS,
} from "@/components/features/studio/members/members-page-model";
import type {
  MemberRow,
  RecruitingGroupMemberRow,
  RecruitingGroupRole,
  RecruitingGroupRow,
  WorkspaceManagementSearch,
} from "@/components/features/studio/members/members-page-model";
import {
  DEFAULT_NEW_GROUP_MEMBER_ROLE,
  RecruitingGroupsPanel,
  hasDuplicateGroupName,
  normalizeGroupName,
  readErrorMessage,
} from "@/components/features/studio/members/members-groups";
export function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const workspaceMemberRole = useWorkspaceMemberRole() as WorkspaceRole;
  const routeSearch = useSearch({ from: "/w/$slug/studio/members" });
  const navigate = useNavigate({ from: "/w/$slug/studio/members" });
  const activeTab = parseWorkspaceManagementTab(routeSearch.tab);
  const {
    data: org,
    refetch,
    isPending,
  } = useQuery({
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: { organizationId: workspaceId },
      });
      if (error || !data) {
        throw new Error(error?.message ?? "加载工作区成员失败");
      }
      return data;
    },
    queryKey: ["workspace-organization", workspaceId],
  });
  const groupsQueryKey = ["workspace-recruiting-groups", slug, workspaceId] as const;
  const [pending, setPending] = useState<string | null>(null);
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

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
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const hasMemberSearch = normalizedMemberSearch.length > 0;
  const filteredRows = useMemo(() => {
    if (!hasMemberSearch) {
      return allRows;
    }
    return allRows.filter((row) => {
      const email = row.email.toLowerCase();
      const name = row.name.toLowerCase();
      return email.includes(normalizedMemberSearch) || name.includes(normalizedMemberSearch);
    });
  }, [allRows, hasMemberSearch, normalizedMemberSearch]);

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

  // 成员列表按显式 workspaceId 拉取，这里做客户端切片
  // 让分页 UI 跟其他 studio 页面 (服务端分页) 视觉一致。
  // total <= pageSize 时 totalPages 仍是 1, DataGrid 会隐藏页码控件。
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize],
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
      organizationId: workspaceId,
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
            organizationId: workspaceId,
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
              onValueChange={(value) => {
                if (value) {
                  void changeWorkspaceRole(r, value);
                }
              }}
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
    <div className="mx-auto w-full max-w-[96em] space-y-6">
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
                  <EmptyTitle>{hasMemberSearch ? "没有匹配的成员" : "暂无成员"}</EmptyTitle>
                  <EmptyDescription>
                    {hasMemberSearch
                      ? "调整邮箱或姓名关键词后重试。"
                      : "邀请同事加入这个工作区，再到招聘组看板里分配组内身份。"}
                  </EmptyDescription>
                </EmptyHeader>
                {hasMemberSearch ? null : (
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
                )}
              </Empty>
            }
            filterValues={{ search: memberSearch }}
            filters={[
              {
                key: "search",
                minWidth: "20rem",
                placeholder: "搜索邮箱或姓名",
                type: "search",
              },
            ]}
            getRowId={(r) => r.id}
            loading={isPending}
            onFilterChange={(key, value) => {
              if (key !== "search") {
                return;
              }
              setMemberSearch(value);
              setPage(1);
            }}
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
