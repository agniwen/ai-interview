"use client";

import { BanIcon, KeyRoundIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/app/(auth)/studio/_components/page-header";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  actionsColumn,
  badgeColumn,
  customColumn,
  DataGrid,
  dateColumn,
  useDataGridState,
} from "@/components/data-grid";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { authClient } from "@/lib/client/auth-client";
import type { AdminUserListResult, AdminUserRecord } from "@/server/routes/studio/routes/users/dao";
import { BanUserDialog } from "./ban-user-dialog";
import { SetPasswordDialog } from "./set-password-dialog";

type UserFilters = {
  role: string;
  banned: string;
} & Record<string, string>;

const INITIAL_FILTERS: UserFilters = {
  banned: "",
  role: "",
};

function toIso(v: Date | string | null | undefined): string | null {
  if (!v) {
    return null;
  }
  return v instanceof Date ? v.toISOString() : v;
}

// CSV → 数组。multi-select 把多选状态以 "a,b" 形式编码进 URL/state。
// CSV → array; multi-select stores its state as "a,b" in the URL/state.
function csvToArray(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchUsers(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: UserFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}): Promise<AdminUserListResult> {
  const offset = (params.page - 1) * params.pageSize;
  const query: Record<string, string | number> = {
    limit: params.pageSize,
    offset,
    sortBy: params.sortBy ?? "createdAt",
    sortDirection: params.sortOrder ?? "desc",
  };

  if (params.search.trim()) {
    query.searchField = "email";
    query.searchOperator = "contains";
    query.searchValue = params.search.trim();
  }

  // better-auth admin 的 filterValue 仅支持单值；多选时只在「恰好选中一项」时下推过滤，
  // 其余情况（0 项 = 不限；2 项 = 全部，对当前 admin/user、normal/banned 二元选项等价于不限）。
  // better-auth admin's filterValue is single-valued; only push a filter when exactly one
  // value is selected. 0 = no filter; 2 (covering both options here) = also no filter.
  const roleArr = csvToArray(params.filters.role);
  const bannedArr = csvToArray(params.filters.banned);
  const [singleRole] = roleArr;
  const [singleBanned] = bannedArr;
  if (roleArr.length === 1 && singleRole) {
    query.filterField = "role";
    query.filterOperator = "eq";
    query.filterValue = singleRole;
  } else if (bannedArr.length === 1 && singleBanned) {
    query.filterField = "banned";
    query.filterOperator = "eq";
    query.filterValue = singleBanned;
  }

  // oxlint-disable-next-line no-explicit-any -- better-auth admin client query 类型较松，转交 any。
  const { data, error } = await authClient.admin.listUsers({ query: query as any });
  if (error) {
    throw new Error(error.message ?? "加载用户失败");
  }

  interface RawUser {
    id: string;
    name: string;
    email: string;
    role?: string | null;
    banned?: boolean | null;
    banReason?: string | null;
    banExpires?: Date | string | null;
    organizationId?: string | null;
    organizationName?: string | null;
    image?: string | null;
    createdAt: Date | string;
  }

  const users = (data?.users ?? []) as unknown as RawUser[];
  const total = data?.total ?? users.length;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  return {
    page: params.page,
    pageSize: params.pageSize,
    records: users.map<AdminUserRecord>((u) => ({
      banExpires: toIso(u.banExpires),
      banReason: u.banReason ?? null,
      banned: Boolean(u.banned),
      createdAt: toIso(u.createdAt) ?? new Date().toISOString(),
      email: u.email,
      id: u.id,
      image: u.image ?? null,
      name: u.name,
      organizationId: u.organizationId ?? null,
      organizationName: u.organizationName ?? null,
      role: u.role ?? "user",
    })),
    total,
    totalPages,
  };
}

const WHITESPACE_REGEX = /\s+/;
function getInitials(name: string, email: string) {
  const source = (name || email || "U").trim();
  const parts = source.split(WHITESPACE_REGEX).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function SystemManagementPage({ initialData }: { initialData: AdminUserListResult }) {
  const grid = useDataGridState<AdminUserRecord, UserFilters>({
    fetcher: fetchUsers,
    initialData,
    initialFilters: INITIAL_FILTERS,
    namespace: "admin-users",
  });

  const [banTarget, setBanTarget] = useState<AdminUserRecord | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUserRecord | null>(null);

  async function handleUnban(record: AdminUserRecord) {
    const { error } = await authClient.admin.unbanUser({ userId: record.id });
    if (error) {
      toast.error(error.message ?? "解封失败");
      return;
    }
    toast.success("已解封");
    grid.invalidate();
  }

  const columns = useMemo(
    () => [
      customColumn<AdminUserRecord>({
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage alt={r.name} src={r.image ?? undefined} />
              <AvatarFallback>{getInitials(r.name, r.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="truncate text-muted-foreground text-xs">{r.email}</div>
            </div>
          </div>
        ),
        key: "user",
        title: "用户",
      }),
      customColumn<AdminUserRecord>({
        cell: (r) => (
          <span className="text-muted-foreground text-sm">{r.organizationName ?? "—"}</span>
        ),
        key: "organizationName",
        title: "组织",
      }),
      badgeColumn<AdminUserRecord>({
        key: "role",
        meta: {
          admin: { label: "管理员", tone: "default" },
          user: { label: "普通用户", tone: "secondary" },
        },
        title: "角色",
      }),
      customColumn<AdminUserRecord>({
        cell: (r) =>
          r.banned ? (
            <Badge variant="destructive">已封禁</Badge>
          ) : (
            <Badge variant="outline">正常</Badge>
          ),
        key: "status",
        title: "状态",
      }),
      dateColumn<AdminUserRecord>({
        key: "createdAt",
        title: "注册时间",
      }),
      actionsColumn<AdminUserRecord>({
        menu: [
          {
            // 仅对非 admin 用户开放设密码；管理员账号请走数据库流程。
            // Only non-admin users; admin password resets must go through the DB.
            icon: KeyRoundIcon,
            label: "设置密码",
            onClick: (r) => setPasswordTarget(r),
            show: (r) => r.role !== "admin",
          },
          {
            // 管理员账号不能封禁/解封，统一走数据库手工调整。
            // Admin accounts can't be banned/unbanned from the UI — DB-only.
            icon: BanIcon,
            label: "封禁用户",
            onClick: (r) => setBanTarget(r),
            separator: "before",
            show: (r) => !r.banned && r.role !== "admin",
            variant: "destructive",
          },
          {
            icon: ShieldCheckIcon,
            label: "解除封禁",
            onClick: (r) => handleUnban(r),
            separator: "before",
            show: (r) => r.banned && r.role !== "admin",
          },
        ],
      }),
    ],
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- callbacks closed over stable refs
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "16rem",
        placeholder: "搜索邮箱",
        type: "search" as const,
      },
      {
        emptyMessage: "无匹配项",
        key: "role" as const,
        options: [
          { label: "管理员", value: "admin" },
          { label: "普通用户", value: "user" },
        ],
        placeholder: "全部角色",
        selectedFormat: (count: number) => `已选 ${count} 个角色`,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "无匹配项",
        key: "banned" as const,
        options: [
          { label: "正常", value: "false" },
          { label: "已封禁", value: "true" },
        ],
        placeholder: "全部状态",
        selectedFormat: (count: number) => `已选 ${count} 个状态`,
        type: "multi-select" as const,
      },
    ],
    [],
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="用户管理"
          description="查看系统用户、封禁/解封违规账号。管理员角色仅由数据库直接调整。"
        />

        <DataGrid<AdminUserRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>暂无用户</EmptyTitle>
                <EmptyDescription>当前筛选条件下没有匹配的用户。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
        />
      </div>

      <BanUserDialog
        onOpenChange={(open) => {
          if (!open) {
            setBanTarget(null);
          }
        }}
        onSuccess={() => {
          setBanTarget(null);
          grid.invalidate();
        }}
        user={banTarget}
      />

      <SetPasswordDialog
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null);
          }
        }}
        onSuccess={() => {
          setPasswordTarget(null);
        }}
        user={passwordTarget}
      />
    </>
  );
}
