"use client";

import {
  BanIcon,
  CheckCircle2Icon,
  LogOutIcon,
  ShieldCheckIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  useDataGridState,
} from "@/components/data-grid";
import { authClient } from "@/lib/shared/auth-client";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { formatDate } from "@/lib/shared/utils/time";

const WHITESPACE_REGEX = /\s+/;

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

interface UserRecord {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  banned: boolean;
  banExpires: string | null;
  banReason: string | null;
  emailVerified: boolean;
  feishuTenantName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UsersResult {
  records: UserRecord[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export function UsersGrid({ initialData }: { initialData: UsersResult }) {
  const fetchUsers = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
      }): Promise<UsersResult> =>
        rpcFetch<UsersResult>(
          rpc.api.platform.users.$get({
            query: {
              page: String(params.page),
              pageSize: String(params.pageSize),
              ...(params.search ? { search: params.search } : {}),
              sortBy: (params.sortBy as "createdAt") ?? "createdAt",
              sortOrder: params.sortOrder ?? "desc",
            },
          }),
          "加载用户列表失败",
        ),
    [],
  );

  const grid = useDataGridState<UserRecord, Record<string, never>>({
    fetcher: fetchUsers,
    initialData,
    initialFilters: {},
    namespace: "platform-users",
  });

  const [forceLogoutTarget, setForceLogoutTarget] = useState<UserRecord | null>(null);
  const [forceLogoutPending, setForceLogoutPending] = useState(false);

  async function confirmForceLogout() {
    if (!forceLogoutTarget) {
      return;
    }
    setForceLogoutPending(true);
    const { error } = await authClient.admin.revokeUserSessions({
      userId: forceLogoutTarget.id,
    });
    setForceLogoutPending(false);
    if (error) {
      toast.error(error.message ?? "强制下线失败");
      return;
    }
    toast.success(`${forceLogoutTarget.name || forceLogoutTarget.email} 的所有 session 已撤销`);
    setForceLogoutTarget(null);
  }

  const columns = useMemo(
    () => [
      customColumn<UserRecord>({
        cell: (r) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarImage alt={r.name} src={r.image ?? undefined} />
              <AvatarFallback>{getInitials(r.name, r.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{r.name}</p>
              <p className="truncate text-muted-foreground text-xs">{r.email}</p>
            </div>
          </div>
        ),
        key: "user",
        title: "用户",
      }),
      customColumn<UserRecord>({
        accessorKey: "role",
        cell: (r) => (
          <Badge variant={r.role === "admin" ? "default" : "outline"}>
            {r.role === "admin" ? <ShieldCheckIcon className="mr-1 size-3" /> : null}
            {r.role}
          </Badge>
        ),
        key: "role",
        title: "平台角色",
      }),
      customColumn<UserRecord>({
        cell: (r) =>
          r.emailVerified ? (
            <Badge variant="success">
              <CheckCircle2Icon className="mr-1 size-3" />
              已验证
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <XCircleIcon className="mr-1 size-3" />
              未验证
            </Badge>
          ),
        key: "emailVerified",
        title: "邮箱验证",
      }),
      customColumn<UserRecord>({
        cell: (r) =>
          r.feishuTenantName ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="max-w-[200px] truncate">
                    {r.feishuTenantName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{r.feishuTenantName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
        key: "feishuTenantName",
        title: "飞书租户",
      }),
      customColumn<UserRecord>({
        cell: (r) =>
          r.banned ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger">
                    <BanIcon className="mr-1 size-3" />
                    已封禁
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    {r.banReason && <p>原因：{r.banReason}</p>}
                    {r.banExpires && <p>解封时间：{formatDate(r.banExpires)}</p>}
                    {!r.banReason && !r.banExpires && <p>永久封禁</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge variant="success">正常</Badge>
          ),
        key: "banned",
        title: "状态",
      }),
      dateColumn<UserRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      dateColumn<UserRecord>({
        key: "updatedAt",
        title: "更新时间",
      }),
      actionsColumn<UserRecord>({
        menu: [
          {
            icon: LogOutIcon,
            label: "强制下线",
            onClick: (r) => setForceLogoutTarget(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    [],
  );

  return (
    <>
      <DataGrid<UserRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有用户</EmptyTitle>
              <EmptyDescription>平台上暂无任何用户记录。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            minWidth: "20rem",
            placeholder: "搜索邮箱或姓名",
            type: "search",
          },
        ]}
        getRowId={(r) => r.id}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setForceLogoutTarget(null)}
        open={forceLogoutTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认强制下线？</AlertDialogTitle>
            <AlertDialogDescription>
              将撤销「{forceLogoutTarget?.name || forceLogoutTarget?.email}」名下所有
              session（不分工作区），下次访问时需要重新登录。封禁账号请用「封禁」操作。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forceLogoutPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={forceLogoutPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmForceLogout();
              }}
              variant="destructive"
            >
              {forceLogoutPending ? "处理中…" : "确认下线"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
