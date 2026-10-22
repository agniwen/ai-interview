import {
  IconFoldUp,
  IconFoldDown,
  IconInfoCircle,
  IconSearch,
  IconSettings,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/features/studio/page-header";
import { ListLoadError } from "@/components/features/data-grid/list-load-error";
import { MemberCell } from "@/components/features/data-grid/cells/member-cell";
import { PermissionGate } from "@/components/features/permission/permission-gate";
import { TimeDisplay } from "@/components/features/display/time-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Empty,
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
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { useHasPermission } from "@/hooks/use-has-permission";
import {
  useWorkspaceId,
  useWorkspaceMemberRole,
  useWorkspaceSlug,
} from "@/lib/client/workspace-context";
import { InviteDialog } from "@/components/features/studio/members/invite-dialog";
import { InviteLinksDrawer } from "@/components/features/studio/members/invite-links-drawer";
import { PendingInvitationsButton } from "@/components/features/studio/members/pending-invitations-section";
import {
  buildWorkspaceRoleOptions,
  getWorkspaceRoleLabel,
} from "@/components/features/studio/members/role-display";
import { WorkspaceSettingsDialog } from "@/components/features/studio/members/workspace-settings-dialog";

import {
  buildAssignableWorkspaceRoles,
  canEditMemberWorkspaceRole,
  getWorkspaceRoleBadgeVariant,
  useDynamicWorkspaceRoles,
} from "@/components/features/studio/members/members-page-model";
import type { MemberRow } from "@/components/features/studio/members/members-page-model";
import {
  flattenMemberTree,
  listManagerCandidates,
  listMembersWithReports,
} from "@/components/features/studio/members/members-tree-model";
import { MembersFloatingActionBar } from "@/components/features/studio/members/members-floating-action-bar";
import { MembersTreeTable } from "@/components/features/studio/members/members-tree-table";
import type { MembersTreeTableColumn } from "@/components/features/studio/members/members-tree-table";

const EMPTY_MEMBERS: MemberRow[] = [];

const MANAGER_HEADER_DESCRIPTION =
  "AI 面试、招聘台和面试管理的数据按汇报线可见：上级能看到所有直接、间接下级创建的数据，同级之间默认互不可见，下级看不到上级的数据。拥有者和管理员能看到全部数据。";
const DOTTED_MANAGER_HEADER_DESCRIPTION =
  "虚线汇报：这里选择的上级也能看到该成员及其全部下级的数据，但不改变成员树和同级关系。不能选择该成员本人或其下级。";
const PEER_SHARING_HEADER_DESCRIPTION =
  "勾选后，与该成员同一直属上级的同级（没有上级的顶层成员互为同级）能看到该成员本人创建的数据，不包括其下级的数据。";

function ColumnHeaderWithInfo({ description, label }: { description: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label={`${label}说明`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
            >
              <IconInfoCircle aria-hidden className="size-3.5" />
            </button>
          }
        />
        <TooltipContent className="max-w-xs text-left font-normal leading-relaxed" side="bottom">
          {description}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const workspaceMemberRole = useWorkspaceMemberRole();
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
  const [pending, setPending] = useState<string | null>(null);
  const canUpdate = useHasPermission("member", "update");
  const canDelete = useHasPermission("member", "delete");
  const canUpdateWorkspace = useHasPermission("organization", "update");
  const { data: session } = authClient.useSession();
  const { data: dynamicWorkspaceRoles = [] } = useDynamicWorkspaceRoles(workspaceId, canUpdate);

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

  const queryClient = useQueryClient();
  const membersQueryKey = ["workspace-member-directory", slug, workspaceId] as const;
  const membersQuery = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载工作区成员失败",
      ),
    queryKey: membersQueryKey,
    refetchOnWindowFocus: false,
  });
  const members = membersQuery.data?.records ?? EMPTY_MEMBERS;
  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: membersQueryKey });

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const hasMemberSearch = deferredSearch.trim().length > 0;
  // null = 尚未手动展开/收起：默认全部展开，直接看到完整汇报线。
  // null means untouched: every manager starts expanded.
  const [expandedUserIds, setExpandedUserIds] = useState<ReadonlySet<string> | null>(null);
  const effectiveExpandedUserIds = useMemo(
    () => expandedUserIds ?? new Set(listMembersWithReports(members)),
    [expandedUserIds, members],
  );
  const treeRows = useMemo(
    () =>
      flattenMemberTree({
        expandedUserIds: effectiveExpandedUserIds,
        query: deferredSearch,
        records: members,
      }),
    [deferredSearch, effectiveExpandedUserIds, members],
  );
  const memberNameByUserId = useMemo(
    () => new Map(members.map((record) => [record.userId, record.name])),
    [members],
  );

  function toggleExpanded(userId: string) {
    setExpandedUserIds(() => {
      const next = new Set(effectiveExpandedUserIds);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  const [selectedUserIds, setSelectedUserIds] = useState<ReadonlySet<string>>(() => new Set());
  // 成员被移除后自动从选择中剔除。Drop selections for members that no longer exist.
  const effectiveSelectedUserIds = useMemo(() => {
    const memberIds = new Set(members.map((record) => record.userId));
    return new Set([...selectedUserIds].filter((userId) => memberIds.has(userId)));
  }, [members, selectedUserIds]);
  const bulkManagerOptions = useMemo(
    () =>
      listManagerCandidates(members, [...effectiveSelectedUserIds]).map((candidate) => ({
        avatarUrl: candidate.image,
        description: candidate.email,
        label: candidate.name,
        value: candidate.userId,
      })),
    [effectiveSelectedUserIds, members],
  );
  const [bulkPending, setBulkPending] = useState(false);

  function toggleSelected(userId: string, selected: boolean) {
    const next = new Set(effectiveSelectedUserIds);
    if (selected) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
    setSelectedUserIds(next);
  }

  function toggleVisibleSelected(selected: boolean) {
    const next = new Set(effectiveSelectedUserIds);
    for (const row of treeRows) {
      if (selected) {
        next.add(row.record.userId);
      } else {
        next.delete(row.record.userId);
      }
    }
    setSelectedUserIds(next);
  }

  async function bulkSetManager(managerUserId: string | null) {
    const userIds = [...effectiveSelectedUserIds];
    if (userIds.length === 0) {
      return;
    }
    setBulkPending(true);
    try {
      await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.manager.$put({
          json: { managerUserId, userIds },
          param: { slug },
        }),
        "批量设置上级失败",
      );
      if (managerUserId) {
        setExpandedUserIds(new Set([...effectiveExpandedUserIds, managerUserId]));
      }
      setSelectedUserIds(new Set());
      await refreshMembers();
      const managerName = managerUserId ? memberNameByUserId.get(managerUserId) : null;
      toast.success(
        managerName
          ? `已将 ${userIds.length} 人的直属上级设为 ${managerName}`
          : `已清除 ${userIds.length} 人的直属上级`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量设置上级失败");
    } finally {
      setBulkPending(false);
    }
  }

  async function changeDottedManagers(row: MemberRow, managerUserIds: string[]) {
    setPending(row.id);
    try {
      await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members[":userId"]["dotted-managers"].$put({
          json: { managerUserIds },
          param: { slug, userId: row.userId },
        }),
        "更新虚线汇报上级失败",
      );
      await refreshMembers();
      toast.success("虚线汇报上级已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新虚线汇报上级失败");
    } finally {
      setPending(null);
    }
  }

  async function changePeerSharing(row: MemberRow, shareWithPeers: boolean) {
    if (row.shareWithPeers === shareWithPeers) {
      return;
    }
    setPending(row.id);
    try {
      await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members[":userId"]["peer-sharing"].$put({
          json: { shareWithPeers },
          param: { slug, userId: row.userId },
        }),
        "更新共享设置失败",
      );
      await refreshMembers();
      toast.success(shareWithPeers ? "已共享给同级" : "已取消共享给同级");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新共享设置失败");
    } finally {
      setPending(null);
    }
  }

  async function changeManager(row: MemberRow, managerUserId: string | null) {
    if (row.managerUserId === managerUserId) {
      return;
    }
    setPending(row.id);
    try {
      await rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members[":userId"].manager.$put({
          json: { managerUserId },
          param: { slug, userId: row.userId },
        }),
        "更新上级失败",
      );
      if (managerUserId) {
        setExpandedUserIds(new Set([...effectiveExpandedUserIds, managerUserId]));
      }
      await refreshMembers();
      toast.success(managerUserId ? "上级已更新" : "已移除上级");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新上级失败");
    } finally {
      setPending(null);
    }
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
    await refreshMembers();
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
          await refreshMembers();
          await refetchOrganization();
          toast.success("成员已移除");
        },
      },
    });
  }

  const columns: MembersTreeTableColumn<MemberRow>[] = [
    {
      cell: ({ record }) => (
        <MemberCell
          avatarSize="sm"
          className="gap-3"
          email={record.email}
          image={record.image}
          name={record.name}
        />
      ),
      key: "name",
      title: "成员",
      width: "minmax(16rem,2fr)",
    },
    {
      cell: ({ record }) => {
        if (!canUpdate) {
          const managerName = record.managerUserId
            ? memberNameByUserId.get(record.managerUserId)
            : null;
          return (
            <span className="truncate text-muted-foreground text-sm">{managerName ?? "—"}</span>
          );
        }
        const managerSelectId = `member-manager-${record.userId}`;
        return (
          <>
            <label className="sr-only" htmlFor={managerSelectId}>
              {`${record.name} 的直属上级`}
            </label>
            <SearchableSelect
              disabled={pending === record.id}
              emptyMessage="没有可选的上级"
              id={managerSelectId}
              modal={false}
              onChange={(value) => {
                void changeManager(record, value);
              }}
              options={listManagerCandidates(members, [record.userId]).map((candidate) => ({
                avatarUrl: candidate.image,
                description: candidate.email,
                label: candidate.name,
                value: candidate.userId,
              }))}
              placeholder="无上级"
              searchPlaceholder="搜索成员"
              triggerClassName="h-8 w-full max-w-52"
              value={record.managerUserId}
            />
          </>
        );
      },
      key: "manager",
      title: <ColumnHeaderWithInfo description={MANAGER_HEADER_DESCRIPTION} label="直属上级" />,
      width: "minmax(12rem,1.2fr)",
    },
    {
      cell: ({ record }) => {
        if (!canUpdate) {
          const names = record.dottedManagerUserIds
            .map((userId) => memberNameByUserId.get(userId))
            .filter(Boolean);
          return (
            <span className="truncate text-muted-foreground text-sm">
              {names.length > 0 ? names.join("、") : "—"}
            </span>
          );
        }
        const dottedSelectId = `member-dotted-managers-${record.userId}`;
        return (
          <>
            <label className="sr-only" htmlFor={dottedSelectId}>
              {`${record.name} 的虚线汇报上级`}
            </label>
            <SearchableMultiSelect
              disabled={pending === record.id}
              emptyMessage="没有可选的上级"
              id={dottedSelectId}
              modal={false}
              onChange={(value) => {
                void changeDottedManagers(record, value);
              }}
              options={listManagerCandidates(members, [record.userId])
                .filter((candidate) => candidate.userId !== record.managerUserId)
                .map((candidate) => ({
                  avatarUrl: candidate.image,
                  description: candidate.email,
                  label: candidate.name,
                  value: candidate.userId,
                }))}
              placeholder="无"
              searchPlaceholder="搜索成员"
              selectedPreviewLimit={1}
              triggerClassName="h-8 w-full max-w-52"
              value={record.dottedManagerUserIds}
            />
          </>
        );
      },
      key: "dottedManagers",
      title: (
        <ColumnHeaderWithInfo
          description={DOTTED_MANAGER_HEADER_DESCRIPTION}
          label="虚线汇报上级"
        />
      ),
      width: "minmax(12rem,1.2fr)",
    },
    {
      cell: ({ record }) =>
        canUpdate ? (
          <Checkbox
            aria-label={`将 ${record.name} 的数据共享给同级`}
            checked={record.shareWithPeers}
            disabled={pending === record.id}
            onCheckedChange={(checked) => {
              void changePeerSharing(record, checked === true);
            }}
          />
        ) : (
          <span className="text-muted-foreground text-sm">
            {record.shareWithPeers ? "已共享" : "—"}
          </span>
        ),
      key: "shareWithPeers",
      title: (
        <ColumnHeaderWithInfo
          description={PEER_SHARING_HEADER_DESCRIPTION}
          label="数据共享给同级"
        />
      ),
      width: "8rem",
    },
    {
      cell: ({ directReportCount }) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {directReportCount > 0 ? `${directReportCount} 人` : "—"}
        </span>
      ),
      key: "reports",
      title: "直属下级",
      width: "6rem",
    },
    {
      cell: ({ record }) => {
        const canEditWorkspaceRole = canEditMemberWorkspaceRole({
          assignableRoles,
          canUpdate,
          currentRole: currentMemberRole,
          currentUserId: session?.user?.id,
          row: record,
        });
        if (!canEditWorkspaceRole) {
          return (
            <Badge variant={getWorkspaceRoleBadgeVariant(record.role)}>
              {getWorkspaceRoleLabel(record.role)}
            </Badge>
          );
        }
        return (
          <Select
            disabled={pending === record.id}
            onValueChange={(value) => {
              if (value) {
                void changeWorkspaceRole(record, value);
              }
            }}
            value={record.role}
          >
            <SelectTrigger aria-label={`${record.name} 的工作区角色`} className="w-36" size="sm">
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
      title: "工作区角色",
      width: "10rem",
    },
    {
      cell: ({ record }) => (
        <span className="text-muted-foreground text-sm">
          <TimeDisplay value={record.createdAt} />
        </span>
      ),
      key: "createdAt",
      title: "加入时间",
      width: "9rem",
    },
    {
      cell: ({ record }) => (
        <span className="text-muted-foreground text-sm">
          {record.lastActiveAt ? <TimeDisplay value={record.lastActiveAt} /> : "从未登录"}
        </span>
      ),
      key: "lastActiveAt",
      title: "最近活跃",
      width: "9rem",
    },
  ];
  if (canDelete) {
    columns.push({
      cell: ({ record }) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`${record.name} 的更多操作`}
                disabled={pending === record.id}
                size="sm"
                variant="text"
              >
                更多
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => removeMember(record)} variant="destructive">
              移除成员
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "text-right",
      key: "actions",
      title: "",
      width: "5rem",
    });
  }

  const allManagerUserIds = listMembersWithReports(members);

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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-64">
              <InputGroupAddon>
                <IconSearch aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="搜索成员"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索姓名或邮箱"
                type="search"
                value={search}
              />
            </InputGroup>
            <Button
              className="w-24"
              disabled={allManagerUserIds.length === 0}
              onClick={() => setExpandedUserIds(new Set(allManagerUserIds))}
              variant="secondary"
            >
              <IconFoldDown />
              全部展开
            </Button>
            <Button
              className="w-24"
              disabled={allManagerUserIds.length === 0}
              onClick={() => setExpandedUserIds(new Set())}
              variant="secondary"
            >
              <IconFoldUp />
              全部收起
            </Button>
            <span className="text-muted-foreground text-sm">共 {members.length} 人</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <PermissionGate action="create" resource="invitation">
              <PendingInvitationsButton organizationId={org?.id ?? null} />
            </PermissionGate>
            <PermissionGate action="create" resource="invitation">
              <InviteLinksDrawer
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
        </div>

        {membersQuery.error ? (
          <ListLoadError
            error={membersQuery.error}
            onRetry={() => {
              void membersQuery.refetch();
            }}
          />
        ) : (
          <MembersTreeTable
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
                      : "邀请同事加入这个工作区，并为他们分配工作区角色。"}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            }
            loading={membersQuery.isPending}
            onToggle={toggleExpanded}
            selection={
              canUpdate
                ? {
                    onToggle: toggleSelected,
                    onToggleVisible: toggleVisibleSelected,
                    selectedUserIds: effectiveSelectedUserIds,
                  }
                : undefined
            }
            rows={treeRows}
          />
        )}
      </div>

      {canUpdate ? (
        <MembersFloatingActionBar
          disabled={bulkPending}
          managerOptions={bulkManagerOptions}
          onClearManager={() => {
            void bulkSetManager(null);
          }}
          onClearSelection={() => setSelectedUserIds(new Set())}
          onSetManager={(managerUserId) => {
            void bulkSetManager(managerUserId);
          }}
          selectedCount={effectiveSelectedUserIds.size}
        />
      ) : null}
    </div>
  );
}
