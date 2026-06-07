"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlusIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { actionsColumn, customColumn, DataGrid } from "@/components/data-grid";
import { PermissionGate } from "@/components/permission/permission-gate";
import { TimeDisplay } from "@/components/time-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { rpc } from "@/lib/client/rpc";
import { authClient } from "@/lib/client/auth-client";
import { useHasPermission } from "@/hooks/use-has-permission";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { InviteDialog } from "./invite-dialog";
import { InviteLinksDialog } from "./invite-links-dialog";
import { PendingInvitationsButton } from "./pending-invitations-section";
import { PermissionsExplanationDialog } from "./permissions-explanation-dialog";
import { ASSIGNABLE_ROLES, getWorkspaceRoleLabel } from "./role-display";
import type { WorkspaceRole } from "./role-display";
import { WorkspaceSettingsDialog } from "./workspace-settings-dialog";

const DEFAULT_PAGE_SIZE = 10;

interface MemberRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: WorkspaceRole;
  createdAt: string | Date;
  lastActiveAt: string | null;
}

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
  viewer: "outline",
};

// admin 在工作区里只能把成员设置为这两个角色之一（hr / viewer）；
// owner 可以设置全部 ASSIGNABLE_ROLES（admin/hr/viewer）。
// owner 角色的转让由 better-auth 内置的 transferOwnership 流程处理，
// 不在 ASSIGNABLE_ROLES 范围。
// Admins can assign only hr/viewer; owners get the full ASSIGNABLE_ROLES set.
const ADMIN_ASSIGNABLE_ROLES = ["hr", "viewer"] as const satisfies readonly WorkspaceRole[];

export function MembersManagementPage() {
  const slug = useWorkspaceSlug();
  const { data: org, refetch, isPending } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const [pending, setPending] = useState<string | null>(null);

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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
    () => (currentMemberRole === "admin" ? ADMIN_ASSIGNABLE_ROLES : ASSIGNABLE_ROLES),
    [currentMemberRole],
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
        role: m.role as WorkspaceRole,
        userId: m.userId,
      };
    });
  }, [org?.members, lastActiveMap]);

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

  async function changeRole(memberId: string, role: WorkspaceRole) {
    setPending(memberId);
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role: role as "owner" | "admin" | "hr" | "viewer",
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "更新角色失败");
      return;
    }
    await refetch();
    toast.success("角色已更新");
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
          //   1. 当前用户没有 member.update 权限（hr / viewer）。
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
    [canUpdate, canDelete, pending, currentUserId, currentMemberRole, assignableRoles],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        description="维护工作区成员、角色和邀请入口，让招聘协作的权限边界清晰可控。"
        title="工作区管理"
      />

      {org ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">{org.name}</p>
            <p className="truncate text-muted-foreground text-sm">/w/{org.slug}</p>
          </div>
          {canUpdateWorkspace ? <WorkspaceSettingsDialog currentName={org.name} /> : null}
        </div>
      ) : null}

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
                邀请同事加入这个工作区，按角色分配管理员、招聘成员或只读成员权限。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <PermissionGate action="create" resource="invitation">
                <InviteDialog
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
          // 移动端按钮自然换行：用 flex-wrap 替代之前的"强制 col → sm:row"，
          // 不再让每颗按钮占满一行；按钮按自身宽度从左到右排，放不下就换行。
          // Mobile-friendly wrap: replace the "force column under sm" pattern
          // with flex-wrap so buttons sit by their intrinsic width and wrap as
          // needed instead of stacking full-width.
          <div className="flex flex-wrap gap-2">
            <PermissionsExplanationDialog />
            <PermissionGate action="create" resource="invitation">
              <PendingInvitationsButton organizationId={org?.id ?? null} />
            </PermissionGate>
            <PermissionGate action="create" resource="invitation">
              <InviteLinksDialog />
              <InviteDialog
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
    </div>
  );
}
