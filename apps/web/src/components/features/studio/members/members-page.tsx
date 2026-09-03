import { IconSettings, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  useDataGridState,
} from "@/components/features/data-grid";
import { MemberCell } from "@/components/features/data-grid/cells/member-cell";
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
import { rpcFetch } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { runAsyncAction } from "@/lib/client/async-control";
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
import { WorkspaceSettingsDialog } from "@/components/features/studio/members/workspace-settings-dialog";

import {
  DEFAULT_PAGE_SIZE,
  WORKSPACE_MEMBER_DEFAULT_SORTING,
  WORKSPACE_MEMBER_SORT_IDS,
  buildAssignableWorkspaceRoles,
  buildWorkspaceMemberListQuery,
  canEditMemberWorkspaceRole,
  getWorkspaceRoleBadgeVariant,
  getPageAfterMemberRemoval,
  reconcileGroupNameDraftState,
  resolveGroupNameDrafts,
  useDynamicWorkspaceRoles,
  EMPTY_RECRUITING_GROUPS,
} from "@/components/features/studio/members/members-page-model";
import type {
  MemberRow,
  RecruitingGroupMemberRow,
  RecruitingGroupRole,
  RecruitingGroupRow,
} from "@/components/features/studio/members/members-page-model";
import {
  buildWorkspaceManagementSearch,
  parseWorkspaceManagementTab,
} from "@/components/features/studio/members/workspace-management-search";
import type { WorkspaceManagementSearch } from "@/components/features/studio/members/workspace-management-search";
import {
  DEFAULT_NEW_GROUP_MEMBER_ROLE,
  RecruitingGroupsPanel,
  hasDuplicateGroupName,
  normalizeGroupName,
  readErrorMessage,
} from "@/components/features/studio/members/members-groups";

const INITIAL_MEMBER_FILTERS = { textFilters: "" };

export function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const workspaceMemberRole = useWorkspaceMemberRole();
  const routeSearch = useSearch({ from: "/w/$slug/studio/members" });
  const navigate = useNavigate({ from: "/w/$slug/studio/members" });
  const queryClient = useQueryClient();
  const activeTab = parseWorkspaceManagementTab(routeSearch.tab);
  const { data: org, refetch: refetchOrganization } = useQuery({
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization({
        query: {
          membersLimit: 1,
          organizationId: workspaceId,
        },
      });
      if (error || !data) {
        throw new Error(error?.message ?? "加载工作区成员失败");
      }
      return data;
    },
    queryKey: ["workspace-organization", workspaceId],
  });
  const memberOptionsQueryKey = ["workspace-member-options", slug, workspaceId] as const;
  const { data: memberOptions } = useQuery({
    enabled: activeTab === "groups",
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.options.$get({ param: { slug } }),
        "加载工作区成员失败",
      ),
    queryKey: memberOptionsQueryKey,
    refetchOnWindowFocus: false,
  });
  const groupsQueryKey = ["workspace-recruiting-groups", slug, workspaceId] as const;
  const [pending, setPending] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const { data: groups = EMPTY_RECRUITING_GROUPS, refetch: refetchGroups } = useQuery({
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const payload = await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.groups.$get({ param: { slug } }),
        "加载组别失败",
      );
      return payload.groups;
    },
    queryKey: groupsQueryKey,
    refetchOnWindowFocus: false,
  });
  const [groupNameDraftState, setGroupNameDraftState] = useState(() => ({
    drafts: {},
    groupIdsKey: JSON.stringify(groups.map((group) => group.id)),
    workspaceId,
  }));
  const ownedGroupNameDraftState = reconcileGroupNameDraftState(
    groups,
    workspaceId,
    groupNameDraftState,
  );
  if (ownedGroupNameDraftState !== groupNameDraftState) {
    setGroupNameDraftState(ownedGroupNameDraftState);
  }
  const resolvedGroupNameDrafts = resolveGroupNameDrafts(groups, ownedGroupNameDraftState.drafts);
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
    const list = memberOptions?.records ?? [];
    return list.map((member) => ({
      createdAt: member.createdAt,
      email: member.email,
      id: member.memberId,
      image: member.image,
      lastActiveAt: null,
      name: member.name,
      role: member.role,
      userId: member.id,
    }));
  }, [memberOptions?.records]);
  const fetchMembers = useMemo(
    () => (params: Parameters<typeof buildWorkspaceMemberListQuery>[0]) =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.$get({
          param: { slug },
          query: buildWorkspaceMemberListQuery(params),
        }),
        "加载工作区成员失败",
      ),
    [slug],
  );
  const memberGrid = useDataGridState<MemberRow, { textFilters: string }>({
    allowedSortIds: WORKSPACE_MEMBER_SORT_IDS,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    defaultSorting: [...WORKSPACE_MEMBER_DEFAULT_SORTING],
    initialFilters: INITIAL_MEMBER_FILTERS,
    queryFn: fetchMembers,
    queryKeyBase: ["workspace-member-list", slug, workspaceId],
    refetchOnWindowFocus: false,
  });
  const hasMemberSearch = Boolean(memberGrid.filters.textFilters);

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
    await runAsyncAction({
      cleanup: () => setDeletingGroupId(null),
      onError: () => toast.error("删除组别失败"),
      operation: async () => {
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
      },
    });
  }

  async function addMemberToGroup(row: MemberRow, groupId: string) {
    const pendingKey = `${groupId}:${row.userId}`;
    setPending(pendingKey);
    await runAsyncAction({
      cleanup: () => setPending(null),
      onError: () => toast.error("添加组成员失败"),
      operation: async () => {
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
      },
    });
  }

  async function moveMemberToGroup(row: MemberRow, sourceGroupId: string, targetGroupId: string) {
    const pendingKey = `${sourceGroupId}:${row.userId}`;
    setPending(pendingKey);
    await runAsyncAction({
      cleanup: () => setPending(null),
      onError: () => toast.error("移动组成员失败"),
      operation: async () => {
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
      },
    });
  }

  async function changeGroupMemberRole(
    groupId: string,
    member: RecruitingGroupMemberRow,
    role: RecruitingGroupRole,
  ) {
    const pendingKey = `${groupId}:${member.userId}`;
    setPending(pendingKey);
    await runAsyncAction({
      cleanup: () => setPending(null),
      onError: () => toast.error("更新组内角色失败"),
      operation: async () => {
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
      },
    });
  }

  async function removeGroupMember(groupId: string, member: RecruitingGroupMemberRow) {
    const pendingKey = `${groupId}:${member.userId}`;
    setPending(pendingKey);
    await runAsyncAction({
      cleanup: () => setPending(null),
      onError: () => toast.error("移出招聘组失败"),
      operation: async () => {
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
      },
    });
  }

  async function changeWorkspaceRole(row: MemberRow, role: string) {
    if (row.role === role) {
      return;
    }
    setPending(row.id);
    // SAFETY: Better Auth's generated client narrows roles to built-ins, while this server
    // validates and supports the workspace's configured dynamic role identifiers as strings.
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
    memberGrid.invalidate();
    void queryClient.invalidateQueries({ queryKey: memberOptionsQueryKey });
    await refetchOrganization();
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
          const nextPage = getPageAfterMemberRemoval({
            page: memberGrid.page,
            visibleRowCount: memberGrid.data.records.length,
          });
          memberGrid.invalidate();
          void queryClient.invalidateQueries({ queryKey: memberOptionsQueryKey });
          if (nextPage !== memberGrid.page) {
            memberGrid.setPage(nextPage);
          }
          await refetchOrganization();
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
        enableSorting: true,
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
        enableSorting: true,
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
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <PageHeader
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
            {...memberGrid.bind}
            columns={columns}
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
            filters={[
              {
                key: "textFilters" as const,
                resource: "members" as const,
                type: "text-filters" as const,
              },
            ]}
            getRowId={(r) => r.id}
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
          />
        </TabsContent>

        <TabsContent className="mt-0" value="groups">
          <RecruitingGroupsPanel
            allRows={allRows}
            canUpdate={canUpdate}
            groupNameDrafts={resolvedGroupNameDrafts}
            groups={groups}
            newGroupName={newGroupName}
            onAddMemberToGroup={addMemberToGroup}
            onCreateGroup={createGroup}
            onDeleteGroup={setDeleteGroupTarget}
            onGroupNameDraftChange={(groupId, value) =>
              setGroupNameDraftState((current) => {
                const owned = reconcileGroupNameDraftState(groups, workspaceId, current);
                return { ...owned, drafts: { ...owned.drafts, [groupId]: value } };
              })
            }
            onRemoveGroupMember={removeGroupMember}
            onRenameGroup={renameGroup}
            onMoveMemberToGroup={moveMemberToGroup}
            onRoleChange={changeGroupMemberRole}
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
