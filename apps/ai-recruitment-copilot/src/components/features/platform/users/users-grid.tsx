"use client";

import {
  IconBan,
  IconBuilding,
  IconCircleCheck,
  IconCircleX,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  useDataGridState,
} from "@/components/data-grid";
import { authClient } from "@/lib/client/auth-client";
import { runAsyncAction } from "@/lib/client/async-control";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { formatDate, formatDateOnly } from "@arc/shared/utils/time";
import { formatUserNameWithRemark } from "./user-display";

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
  lastActiveAt: string | null;
  remark: string | null;
  updatedAt: string;
}

interface UsersResult {
  records: UserRecord[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

interface PlatformUsersQuery {
  page: string;
  pageSize: string;
  search?: string;
  sortBy: UserSortColumn;
  sortOrder: "asc" | "desc";
}

type UserSortColumn = "name" | "email" | "role" | "createdAt" | "lastActiveAt";

interface UserWorkspacesResult {
  records: {
    id: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    organizationCreatedAt: string;
    role: string;
    createdAt: string;
  }[];
  total: number;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "admin":
    case "owner": {
      return "default";
    }
    case "hr": {
      return "secondary";
    }
    default: {
      return "outline";
    }
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "admin": {
      return "管理员";
    }
    case "hr": {
      return "HR";
    }
    case "owner": {
      return "所有者";
    }
    case "viewer": {
      return "只读";
    }
    default: {
      return role;
    }
  }
}

function isUserSortColumn(sortBy: string): sortBy is UserSortColumn {
  return ["name", "email", "role", "createdAt", "lastActiveAt"].includes(sortBy);
}

async function loadUserWorkspaces(
  userId: string,
): Promise<{ data: UserWorkspacesResult; error: null } | { data: null; error: string }> {
  try {
    const data = await rpcFetch<UserWorkspacesResult>(
      rpc.api.platform.users[":userId"].workspaces.$get({
        param: { userId },
      }),
      "加载用户工作区失败",
    );
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "加载用户工作区失败",
    };
  }
}

function UserWorkspacesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card className="gap-0 rounded-lg py-0" key={index}>
          <CardContent className="p-3">
            <Skeleton className="mb-2 h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UserWorkspacesList({ data }: { data: UserWorkspacesResult }) {
  if (data.records.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">暂未加入工作区</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {data.records.map((workspace) => (
        <Card className="gap-0 rounded-lg py-0" key={workspace.id}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{workspace.organizationName}</p>
                <p className="truncate font-mono text-muted-foreground text-xs">
                  /w/{workspace.organizationSlug}
                </p>
              </div>
              <Badge variant={getRoleBadgeVariant(workspace.role)}>
                {getRoleLabel(workspace.role)}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
              <span>加入于 {formatDateOnly(workspace.createdAt)}</span>
              <span>工作区创建于 {formatDateOnly(workspace.organizationCreatedAt)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UserWorkspacesContent({ user }: { user: UserRecord }) {
  const [data, setData] = useState<UserWorkspacesResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const result = await loadUserWorkspaces(user.id);
      if (!active) {
        return;
      }
      if (result.error) {
        toast.error(result.error);
      } else {
        setData(result.data);
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [user.id]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconBuilding className="size-5" />
          用户加入的工作区
        </DialogTitle>
        <DialogDescription>
          {`${user.name || user.email} · ${data?.total ?? 0} 个工作区`}
        </DialogDescription>
      </DialogHeader>

      <Separator />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !data ? <UserWorkspacesSkeleton /> : null}
        {data ? <UserWorkspacesList data={data} /> : null}
      </div>
    </>
  );
}

function UserWorkspacesDialog({
  onOpenChange,
  open,
  user,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: UserRecord | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[80vh] max-w-2xl flex flex-col">
        {user ? <UserWorkspacesContent key={user.id} user={user} /> : null}
      </DialogContent>
    </Dialog>
  );
}

export function UsersGrid() {
  function fetchUsers(params: {
    search: string;
    page: number;
    pageSize: number;
    filters: Record<string, never>;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }): Promise<UsersResult> {
    const query: PlatformUsersQuery = {
      page: String(params.page),
      pageSize: String(params.pageSize),
      sortBy: params.sortBy && isUserSortColumn(params.sortBy) ? params.sortBy : "lastActiveAt",
      sortOrder: params.sortOrder ?? "desc",
    };
    if (params.search) {
      query.search = params.search;
    }
    return rpcFetch<UsersResult>(
      rpc.api.platform.users.$get({
        query,
      }),
      "加载用户列表失败",
    );
  }

  const grid = useDataGridState<UserRecord, Record<string, never>>({
    allowedSortIds: ["name", "email", "role", "createdAt", "lastActiveAt"],
    defaultSorting: [{ desc: true, id: "lastActiveAt" }],
    initialFilters: {},
    queryFn: fetchUsers,
    queryKeyBase: ["platform-users"],
  });

  const [forceLogoutTarget, setForceLogoutTarget] = useState<UserRecord | null>(null);
  const [forceLogoutPending, setForceLogoutPending] = useState(false);
  const [banTarget, setBanTarget] = useState<UserRecord | null>(null);
  const [banPending, setBanPending] = useState(false);
  const [unbanTarget, setUnbanTarget] = useState<UserRecord | null>(null);
  const [unbanPending, setUnbanPending] = useState(false);
  const [remarkTarget, setRemarkTarget] = useState<UserRecord | null>(null);
  const [remarkValue, setRemarkValue] = useState("");
  const [remarkPending, setRemarkPending] = useState(false);
  const [workspacesTarget, setWorkspacesTarget] = useState<UserRecord | null>(null);

  function openRemarkDialog(record: UserRecord) {
    setRemarkTarget(record);
    setRemarkValue(record.remark ?? "");
  }

  async function saveRemark() {
    if (!remarkTarget) {
      return;
    }
    setRemarkPending(true);
    await runAsyncAction({
      cleanup: () => setRemarkPending(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "保存备注失败"),
      operation: async () => {
        await rpcFetch(
          rpc.api.platform.users[":userId"].remark.$patch({
            json: {
              remark: remarkValue.trim() || null,
            },
            param: { userId: remarkTarget.id },
          }),
          "保存备注失败",
        );
        toast.success("备注已保存");
        setRemarkTarget(null);
        await grid.invalidate();
      },
    });
  }

  async function confirmBanUser() {
    if (!banTarget) {
      return;
    }
    setBanPending(true);
    const { error } = await authClient.admin
      .banUser({
        banReason: "平台管理员封禁",
        userId: banTarget.id,
      })
      .finally(() => setBanPending(false));
    if (error) {
      toast.error(error.message ?? "封禁用户失败");
      return;
    }
    toast.success(`${banTarget.name || banTarget.email} 已封禁并强制退出登录`);
    setBanTarget(null);
    await grid.invalidate();
  }

  async function confirmUnbanUser() {
    if (!unbanTarget) {
      return;
    }
    setUnbanPending(true);
    const { error } = await authClient.admin
      .unbanUser({
        userId: unbanTarget.id,
      })
      .finally(() => setUnbanPending(false));
    if (error) {
      toast.error(error.message ?? "解封用户失败");
      return;
    }
    toast.success(`${unbanTarget.name || unbanTarget.email} 已解封`);
    setUnbanTarget(null);
    await grid.invalidate();
  }

  async function confirmForceLogout() {
    if (!forceLogoutTarget) {
      return;
    }
    setForceLogoutPending(true);
    const { error } = await authClient.admin
      .revokeUserSessions({
        userId: forceLogoutTarget.id,
      })
      .finally(() => setForceLogoutPending(false));
    if (error) {
      toast.error(error.message ?? "强制下线失败");
      return;
    }
    toast.success(`${forceLogoutTarget.name || forceLogoutTarget.email} 的所有 session 已撤销`);
    setForceLogoutTarget(null);
  }

  const columns = [
    customColumn<UserRecord>({
      cell: (r) => (
        <MemberCell
          email={r.email}
          image={r.image}
          name={formatUserNameWithRemark(r.name, r.remark, r.email)}
        />
      ),
      key: "user",
      title: "用户",
    }),
    customColumn<UserRecord>({
      accessorKey: "role",
      cell: (r) => (
        <Badge variant={r.role === "admin" ? "default" : "outline"}>
          {r.role === "admin" ? <IconShieldCheck className="mr-1 size-3" /> : null}
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
            <IconCircleCheck className="mr-1 size-3" />
            已验证
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <IconCircleX className="mr-1 size-3" />
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
              <TooltipTrigger
                render={
                  <Badge variant="outline" className="max-w-[200px] truncate">
                    {r.feishuTenantName}
                  </Badge>
                }
              />
              <TooltipContent>{r.feishuTenantName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-muted-foreground text-xs">未绑定</span>
        ),
      key: "feishuTenantName",
      title: "飞书租户",
    }),
    customColumn<UserRecord>({
      cell: (r) =>
        r.banned ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="danger">
                    <IconBan className="mr-1 size-3" />
                    已封禁
                  </Badge>
                }
              />
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
    dateColumn<UserRecord>({
      emptyText: "从未登录",
      key: "lastActiveAt",
      sortable: true,
      title: "最近活跃",
    }),
    actionsColumn<UserRecord>({
      menu: [
        {
          label: "查看加入的工作区",
          onClick: (r) => setWorkspacesTarget(r),
        },
        {
          label: "编辑备注",
          onClick: (r) => openRemarkDialog(r),
        },
        {
          label: "封禁用户",
          onClick: (r) => setBanTarget(r),
          separator: "before",
          show: (r) => !r.banned,
          variant: "destructive",
        },
        {
          label: "解封用户",
          onClick: (r) => setUnbanTarget(r),
          separator: "before",
          show: (r) => r.banned,
        },
        {
          label: "强制下线",
          onClick: (r) => setForceLogoutTarget(r),
          variant: "destructive",
        },
      ],
    }),
  ];

  return (
    <>
      <DataGrid<UserRecord>
        {...grid.bind}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconUsers className="size-5" />
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRemarkTarget(null);
          }
        }}
        open={remarkTarget !== null}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户备注</DialogTitle>
            <DialogDescription>
              {remarkTarget ? remarkTarget.name || remarkTarget.email : "为用户添加平台内部备注。"}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="platform-user-remark">备注</FieldLabel>
            <Input
              id="platform-user-remark"
              maxLength={80}
              onChange={(event) => setRemarkValue(event.target.value)}
              placeholder="例如：供应商账号、测试账号"
              value={remarkValue}
            />
          </Field>
          <DialogFooter>
            <Button
              disabled={remarkPending}
              onClick={() => setRemarkTarget(null)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={remarkPending} onClick={saveRemark} type="button">
              {remarkPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={(open) => !open && setBanTarget(null)} open={banTarget !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认封禁用户？</AlertDialogTitle>
            <AlertDialogDescription>
              将封禁「{banTarget?.name || banTarget?.email}」并撤销该用户所有 session。
              之后该用户再次登录会看到封禁提示，并保持退出登录状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={banPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={banPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmBanUser();
              }}
              variant="destructive"
            >
              {banPending ? "处理中…" : "确认封禁"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => !open && setUnbanTarget(null)}
        open={unbanTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解封用户？</AlertDialogTitle>
            <AlertDialogDescription>
              {`将解除「${unbanTarget?.name || unbanTarget?.email}」的封禁状态。解封后该用户可以重新登录。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unbanPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={unbanPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmUnbanUser();
              }}
            >
              {unbanPending ? "处理中…" : "确认解封"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <UserWorkspacesDialog
        onOpenChange={(open) => !open && setWorkspacesTarget(null)}
        open={workspacesTarget !== null}
        user={workspacesTarget}
      />
    </>
  );
}
