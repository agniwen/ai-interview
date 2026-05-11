"use client";

import { Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { actionsColumn, customColumn, DataGrid, textColumn } from "@/components/data-grid";
import { PermissionGate } from "@/components/permission/permission-gate";
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
import { authClient } from "@/lib/client/auth-client";
import { useHasPermission } from "@/hooks/use-has-permission";
import { InviteDialog } from "./invite-dialog";

const ROLE_OPTIONS = ["owner", "admin", "hr", "viewer"] as const;
type WorkspaceRole = (typeof ROLE_OPTIONS)[number];

// 内存数据下分页不会被触发的 noop。函数体里放一行注释让 oxlint 的
// no-empty-function 满意 (项目通行写法,见 src/hooks/use-hydrated.ts)。
const noop: (..._: never[]) => void = () => {
  // intentional no-op — DataGrid pagination callbacks unused in static mode
};

interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string | Date;
}

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  hr: "secondary",
  owner: "default",
  viewer: "outline",
};

export function MembersManagementPage() {
  const { data: org, refetch, isPending } = authClient.useActiveOrganization();
  const [pending, setPending] = useState<string | null>(null);
  const canUpdate = useHasPermission("member", "update");
  const canDelete = useHasPermission("member", "delete");

  const rows: MemberRow[] = useMemo(() => {
    const list = org?.members ?? [];
    return list.map((m) => {
      const { user } = m as { user?: { email?: string; name?: string } };
      return {
        createdAt: m.createdAt as string | Date,
        email: user?.email ?? "—",
        id: m.id,
        name: user?.name ?? "—",
        role: m.role as WorkspaceRole,
      };
    });
  }, [org?.members]);

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
      textColumn<MemberRow>({
        key: "email",
        primary: true,
        secondary: (r) => r.name,
        title: "邮箱",
      }),
      customColumn<MemberRow>({
        cell: (r) =>
          canUpdate ? (
            <Select
              disabled={pending === r.id}
              onValueChange={(v) => void changeRole(r.id, v as WorkspaceRole)}
              value={r.role}
            >
              <SelectTrigger className="w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant={ROLE_BADGE_VARIANT[r.role]}>{r.role}</Badge>
          ),
        key: "role",
        size: 160,
        title: "角色",
      }),
      customColumn<MemberRow>({
        cell: (r) => (
          <span className="text-muted-foreground text-sm">
            {new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false })}
          </span>
        ),
        key: "createdAt",
        title: "加入时间",
      }),
      actionsColumn<MemberRow>({
        menu: canDelete
          ? [
              {
                icon: Trash2Icon,
                label: "移除成员",
                onClick: (r) => removeMember(r),
                variant: "destructive",
              },
            ]
          : [],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 列定义只依赖权限值，剧场切换时无需重建
    [canUpdate, canDelete, pending],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        description="管理当前工作区的成员、角色与邀请。owner 与 admin 可邀请新成员、调整他人角色。"
        title="成员管理"
      />

      <DataGrid<MemberRow>
        columns={columns}
        data={rows}
        empty={
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>暂无成员</EmptyTitle>
              <EmptyDescription>
                邀请同事加入这个工作区，按角色分配 admin / hr / viewer 权限。
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
          // 成员列表来自 authClient.useActiveOrganization() 内存数据,不走分页。
          onPageChange: noop,
          onPageSizeChange: noop,
          page: 1,
          pageSize: Math.max(rows.length, 1),
        }}
        toolbarRight={
          <PermissionGate action="create" resource="invitation">
            <InviteDialog
              trigger={
                <Button className="flex-1 sm:flex-none">
                  <UserPlusIcon className="size-4" />
                  邀请成员
                </Button>
              }
            />
          </PermissionGate>
        }
        total={rows.length}
        totalPages={1}
      />
    </div>
  );
}
