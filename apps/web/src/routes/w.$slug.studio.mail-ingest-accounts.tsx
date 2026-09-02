import { listTextQuery } from "@app/shared/list-text-filters";
import { IconInbox } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  createFileRoute,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  useDataGridState,
} from "@/components/features/data-grid";
import type { DataGridFetchParams, DataGridFetchResult } from "@/components/features/data-grid";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { MemberCell } from "@/components/features/data-grid/cells/member-cell";
import { TimeDisplay } from "@/components/features/display/time-display";
import { MailIngestRunNowButton } from "@/components/features/studio/mail-ingest/mail-ingest-run-now-button";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  SettingsGroup,
  SettingsRow,
} from "@/components/features/studio/profile/profile-settings-ui";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import {
  WORKSPACE_ROLES,
  buildWorkspaceRoleOptions,
} from "@/components/features/studio/members/role-display";
import { sortDynamicWorkspaceRolesByCreatedAt } from "@/components/features/studio/members/workspace-role-permissions";
import { isWorkspaceAdministratorRole } from "@app/shared/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/client/auth-client";
import { rpcFetch } from "@/lib/client/api";
import { useHasPermission } from "@/hooks/use-has-permission";
import {
  dateTimeLocalInputToISOString,
  isoStringToDateTimeLocalInput,
} from "@/lib/client/datetime-local";
import {
  DEFAULT_MAIL_INGEST_PROVIDER_ID,
  MAIL_INGEST_PROVIDERS,
  applyMailIngestProvider,
  getMailIngestProvider,
  resolveMailIngestProviderId,
} from "@/lib/client/mail-ingest-providers";
import type { MailIngestProviderId } from "@/lib/client/mail-ingest-providers";
import {
  DEFAULT_MAIL_INGEST_PLATFORM_ID,
  MAIL_INGEST_PLATFORMS,
  getMailIngestPlatform,
  isMailIngestPlatformId,
  resolveMailIngestPlatformId,
} from "@/lib/client/mail-ingest-platforms";
import type { MailIngestPlatformId } from "@/lib/client/mail-ingest-platforms";
import { rpc } from "@/lib/client/rpc";
import {
  useWorkspaceId,
  useWorkspaceMemberRole,
  useWorkspaceSlug,
} from "@/lib/client/workspace-context";

const DEFAULT_MAIL_INGEST_PROVIDER = getMailIngestProvider(DEFAULT_MAIL_INGEST_PROVIDER_ID);

interface MailIngestAccountRecord {
  createdAt: string;
  emailAddress: string;
  enabled: boolean;
  hasPassword: boolean;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  listenStartAt: string | null;
  mailbox: string;
  processedMailbox: string;
  subjectKeyword: string;
  updatedAt: string;
  username: string;
}

interface ManagedMailIngestRow {
  account: MailIngestAccountRecord | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
  messageCount: number;
  problemCount: number;
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
    role: string;
  };
}

interface ManagedMailIngestResult extends DataGridFetchResult<ManagedMailIngestRow> {
  page: number;
  pageSize: number;
}

interface ManagedMailIngestQuery {
  page: string;
  pageSize: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}

interface MailIngestFormState {
  emailAddress: string;
  enabled: boolean;
  imapHost: string;
  imapPort: string;
  listenStartAt: string;
  password: string;
  providerId: MailIngestProviderId;
  monitoringPlatform: MailIngestPlatformId;
  userId: string;
}

const DEFAULT_FORM = {
  emailAddress: "",
  enabled: true,
  imapHost: DEFAULT_MAIL_INGEST_PROVIDER.imapHost,
  imapPort: DEFAULT_MAIL_INGEST_PROVIDER.imapPort,
  listenStartAt: "",
  password: "",
  providerId: DEFAULT_MAIL_INGEST_PROVIDER_ID,
  monitoringPlatform: DEFAULT_MAIL_INGEST_PLATFORM_ID,
  userId: "",
} satisfies MailIngestFormState;

function buildNewForm(user: ManagedMailIngestRow["user"]): MailIngestFormState {
  return {
    ...DEFAULT_FORM,
    emailAddress: user.email,
    listenStartAt: isoStringToDateTimeLocalInput(new Date().toISOString()),
    userId: user.id,
  };
}

function buildInitialForm(row: ManagedMailIngestRow): MailIngestFormState {
  if (row.account) {
    return {
      emailAddress: row.account.emailAddress,
      enabled: row.account.enabled,
      imapHost: row.account.imapHost,
      imapPort: String(row.account.imapPort),
      listenStartAt: isoStringToDateTimeLocalInput(row.account.listenStartAt),
      password: "",
      providerId: resolveMailIngestProviderId(row.account.imapHost, row.account.imapPort),
      monitoringPlatform: resolveMailIngestPlatformId(row.account.subjectKeyword),
      userId: row.user.id,
    };
  }

  return buildNewForm(row.user);
}

function toPayload(form: MailIngestFormState) {
  const port = Number.parseInt(form.imapPort, 10);
  if (!(Number.isFinite(port) && port > 0)) {
    throw new Error("IMAP 端口无效");
  }
  const emailAddress = form.emailAddress.trim();
  if (!emailAddress) {
    throw new Error("监听邮箱不能为空");
  }

  return {
    emailAddress,
    enabled: form.enabled,
    failedMailbox: "ARC-Failed",
    imapHost: form.imapHost.trim(),
    imapPort: port,
    imapSecure: true,
    listenStartAt: dateTimeLocalInputToISOString(form.listenStartAt),
    mailbox: "INBOX",
    processedMailbox: "ARC-Processed",
    subjectKeyword: getMailIngestPlatform(form.monitoringPlatform).subjectKeyword,
    username: emailAddress,
  };
}

export function renderMessageBadge(
  row: {
    account: { emailAddress: string; id: string } | null;
    messageCount: number;
    problemCount: number;
  },
  onSelect: (accountId: string) => void,
) {
  if (!row.account) {
    return <span className="text-muted-foreground">—</span>;
  }
  const { account } = row;
  return (
    <button
      aria-label={`查看 ${account.emailAddress} 的入库记录`}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm hover:bg-muted focus-visible:outline-2"
      onClick={() => onSelect(account.id)}
      type="button"
    >
      <span>{row.messageCount}</span>
      {row.problemCount > 0 ? <span className="text-destructive">·{row.problemCount}</span> : null}
    </button>
  );
}

function MailIngestAccountDialog({
  onOpenChange,
  open,
  row,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  row: ManagedMailIngestRow | null;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MailIngestFormState>(DEFAULT_FORM);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setForm(row ? buildInitialForm(row) : DEFAULT_FORM);
  }, [row]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) {
        return;
      }
      const payload = toPayload(form);
      const password = form.password.trim();

      if (row.account) {
        const updatePayload = password ? { ...payload, password } : payload;
        await rpcFetch(
          rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed[":id"].$patch({
            json: updatePayload,
            param: { id: row.account.id, slug },
          }),
          "邮箱监听配置更新失败",
        );
        return;
      }

      if (!password) {
        throw new Error("创建配置时必须填写客户端密码");
      }
      await rpcFetch(
        rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed.$post({
          json: {
            ...payload,
            password,
            userId: form.userId,
          },
          param: { slug },
        }),
        "邮箱监听配置保存失败",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "邮箱监听配置保存失败");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["managed-mail-ingest-accounts", slug] });
      toast.success(row?.account ? "邮箱监听配置已更新" : "邮箱监听配置已创建");
      onOpenChange(false);
    },
  });

  const pending = mutation.isPending;
  const isEdit = Boolean(row?.account);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑邮箱监听" : "创建邮箱监听"}</DialogTitle>
          <DialogDescription>
            {row
              ? `${row.user.name || row.user.email} · ${row.user.email}`
              : "选择成员并填写邮箱监听配置。"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <SettingsGroup>
            <SettingsRow htmlFor="mail-ingest-user" label="成员">
              <Select disabled value={form.userId}>
                <SelectTrigger id="mail-ingest-user" className="w-full">
                  <SelectValue placeholder="选择成员" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {row ? (
                      <SelectItem value={row.user.id}>{row.user.name || row.user.email}</SelectItem>
                    ) : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow
              description="用于接收简历邮件，也会作为邮箱登录账号提交。"
              htmlFor="mail-ingest-email"
              label="监听邮箱"
            >
              <Input
                id="mail-ingest-email"
                autoComplete="email"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailAddress: event.target.value }))
                }
                placeholder="hr@example.com"
                type="email"
                value={form.emailAddress}
              />
            </SettingsRow>

            <SettingsRow
              description={isEdit ? "留空则沿用已保存的客户端密码。" : undefined}
              htmlFor="mail-ingest-password"
              label="客户端密码"
            >
              <Input
                id="mail-ingest-password"
                autoComplete="new-password"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={isEdit ? "留空则不修改" : "请输入邮箱客户端密码"}
                type="password"
                value={form.password}
              />
            </SettingsRow>

            <SettingsRow
              description={`IMAP：${form.imapHost}:${form.imapPort}`}
              htmlFor="mail-ingest-provider"
              label="邮箱服务"
            >
              <Select
                disabled={pending}
                value={form.providerId}
                onValueChange={(value) => {
                  const provider = MAIL_INGEST_PROVIDERS.find((item) => item.id === value);
                  if (!provider) {
                    return;
                  }
                  setForm((current) =>
                    applyMailIngestProvider({ ...current, providerId: provider.id }, provider.id),
                  );
                }}
              >
                <SelectTrigger className="w-full" id="mail-ingest-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MAIL_INGEST_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow
              description="提交时会将监听平台映射为对应的邮件标题关键字。"
              htmlFor="mail-ingest-platform"
              label="监听平台"
            >
              <Select
                disabled={pending}
                value={form.monitoringPlatform}
                onValueChange={(value) => {
                  if (!value || !isMailIngestPlatformId(value)) {
                    return;
                  }
                  setForm((current) => ({ ...current, monitoringPlatform: value }));
                }}
              >
                <SelectTrigger className="w-full" id="mail-ingest-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MAIL_INGEST_PLATFORMS.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id}>
                        {platform.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingsRow>

            <SettingsRow
              description="留空表示扫描全部邮件；创建时默认从当前时间开始。"
              htmlFor="mail-ingest-listen-start"
              label="监听起始时间"
            >
              <DateTimePicker
                id="mail-ingest-listen-start"
                disabled={pending}
                onValueChange={(listenStartAt) =>
                  setForm((current) => ({ ...current, listenStartAt }))
                }
                value={form.listenStartAt}
              />
            </SettingsRow>

            <SettingsRow description="关闭后停止轮询该邮箱。" label="启用监听">
              <Switch
                checked={form.enabled}
                disabled={pending}
                id="mail-ingest-enabled"
                onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
              />
            </SettingsRow>
          </SettingsGroup>

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? "保存中" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagedMailIngestPage() {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const workspaceMemberRole = useWorkspaceMemberRole();
  const canManageMailIngestAccounts = useHasPermission("mailIngestAccount", "manage");
  const canImmediatelyPollMailIngest =
    canManageMailIngestAccounts && isWorkspaceAdministratorRole(workspaceMemberRole);
  const [editingRow, setEditingRow] = useState<ManagedMailIngestRow | null>(null);
  const { data: dynamicWorkspaceRoles = [] } = useQuery({
    enabled: canManageMailIngestAccounts,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listRoles({
        query: { organizationId: workspaceId },
      });
      if (error) {
        throw new Error(error.message ?? "加载自定义角色失败");
      }
      return data ?? [];
    },
    queryKey: ["workspace-dynamic-roles", workspaceId],
    refetchOnWindowFocus: false,
    select: sortDynamicWorkspaceRolesByCreatedAt,
  });

  function fetchMailIngestRows(
    params: DataGridFetchParams<Record<string, never>>,
  ): Promise<ManagedMailIngestResult> {
    const query: ManagedMailIngestQuery = {
      ...listTextQuery(params),
      page: String(params.page),
      pageSize: String(params.pageSize),
    };
    if (params.search) {
      query.search = params.search;
    }
    if (params.sortBy) {
      query.sortBy = params.sortBy;
    }
    if (params.sortOrder) {
      query.sortOrder = params.sortOrder;
    }
    return rpcFetch(
      rpc.api.w[":slug"].studio["mail-ingest-accounts"].managed.$get({
        param: { slug },
        query,
      }),
      "加载邮箱监听配置失败",
    );
  }

  const grid = useDataGridState<ManagedMailIngestRow, Record<string, never>>({
    initialFilters: {},
    queryFn: fetchMailIngestRows,
    queryKeyBase: ["managed-mail-ingest-accounts", slug],
  });
  const roleLabelByValue = useMemo(() => {
    const roles = [...WORKSPACE_ROLES, ...dynamicWorkspaceRoles.map((role) => role.role)].filter(
      (role, index, list) => list.indexOf(role) === index,
    );
    return new Map(
      buildWorkspaceRoleOptions(roles, dynamicWorkspaceRoles).map((role) => [
        role.value,
        role.label,
      ]),
    );
  }, [dynamicWorkspaceRoles]);

  const columns = useMemo(
    () => [
      customColumn<ManagedMailIngestRow>({
        cell: (row) => (
          <MemberCell email={row.user.email} image={row.user.image} name={row.user.name} />
        ),
        key: "userName",
        title: "成员",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) =>
          row.account ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate">{row.account.emailAddress}</span>
              <span className="truncate text-muted-foreground text-xs">{row.account.username}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">未配置</span>
          ),
        key: "emailAddress",
        title: "监听邮箱",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) => (
          <Badge variant={row.user.role === "owner" ? "default" : "outline"}>
            {roleLabelByValue.get(row.user.role) ?? row.user.role}
          </Badge>
        ),
        key: "role",
        title: "角色",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) => {
          let statusLabel = "未配置";
          if (row.account?.enabled) {
            statusLabel = "启用";
          } else if (row.account) {
            statusLabel = "停用";
          }
          return (
            <Badge variant={row.account?.enabled ? "success" : "outline"}>{statusLabel}</Badge>
          );
        },
        key: "status",
        title: "状态",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) =>
          renderMessageBadge(row, (id) => {
            void navigate({
              params: { id, slug },
              to: "/w/$slug/studio/mail-ingest-accounts/$id",
            });
          }),
        key: "messageLog",
        title: "入库记录",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) =>
          row.account ? (
            <span className="font-mono text-xs">
              {row.account.imapHost}:{row.account.imapPort}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        key: "imapHost",
        title: "IMAP",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) => row.account?.subjectKeyword ?? "-",
        key: "subjectKeyword",
        title: "监听平台",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) =>
          row.account ? (
            <TimeDisplay value={row.account.listenStartAt} emptyText="扫描全部" as="span" />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        key: "listenStartAt",
        title: "监听起始",
      }),
      customColumn<ManagedMailIngestRow>({
        cell: (row) =>
          row.account ? (
            <div className="flex flex-col gap-1">
              <TimeDisplay value={row.account.lastCheckedAt} emptyText="尚未轮询" as="span" />
              {row.account.lastError ? (
                <span className="max-w-60 truncate text-destructive text-xs">
                  {row.account.lastError}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        key: "lastCheckedAt",
        title: "上次轮询",
      }),
      actionsColumn<ManagedMailIngestRow>({
        inline: [
          {
            label: "查看",
            onClick: (row) => {
              if (!row.account) {
                return;
              }
              void navigate({
                params: { id: row.account.id, slug },
                to: "/w/$slug/studio/mail-ingest-accounts/$id",
              });
            },
            show: (row) => Boolean(row.account),
          },
          {
            label: "编辑",
            onClick: (row) => setEditingRow(row),
            show: (row) => canManageMailIngestAccounts && Boolean(row.account),
          },
          {
            label: "创建",
            onClick: (row) => setEditingRow(row),
            show: (row) => canManageMailIngestAccounts && !row.account,
          },
        ],
        // 最多同时显示“查看”和“编辑”，按两个实际按钮的内容宽度锁定列宽。
        size: 114,
      }),
    ],
    [canManageMailIngestAccounts, navigate, roleLabelByValue, slug],
  );

  return (
    <div className="mx-auto w-full max-w-[96rem] flex flex-col gap-6">
      <PageHeader title="邮箱监听" description="管理员可查看全部账号，其他成员仅查看自己的账号。" />

      <DataGrid<ManagedMailIngestRow>
        {...grid.bind}
        columnPinning={{ end: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconInbox />
              </EmptyMedia>
              <EmptyTitle>{grid.search ? "没有匹配的邮箱监听配置" : "暂无工作区成员"}</EmptyTitle>
              <EmptyDescription>
                {grid.search
                  ? "调整搜索关键词后重试。"
                  : "邀请成员加入工作区后，可在这里配置邮箱监听。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "textFilters" as const,
            type: "text-filters" as const,
            resource: "mailAccounts" as const,
          },
        ]}
        getRowId={(row) => `${row.user.id}:${row.account?.id ?? "empty"}`}
        toolbarRight={
          <MailIngestRunNowButton canManage={canImmediatelyPollMailIngest} slug={slug} />
        }
      />

      <MailIngestAccountDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
          }
        }}
        open={editingRow !== null}
        row={editingRow}
      />
    </div>
  );
}

export function shouldRenderMailIngestOutlet(pathname: string, slug: string) {
  return pathname !== `/w/${slug}/studio/mail-ingest-accounts`;
}

function ManagedMailIngestRoute() {
  const { slug } = useParams({ from: "/w/$slug/studio/mail-ingest-accounts" });
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return shouldRenderMailIngestOutlet(pathname, slug) ? <Outlet /> : <ManagedMailIngestPage />;
}

export const Route = createFileRoute("/w/$slug/studio/mail-ingest-accounts")({
  component: ManagedMailIngestRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("邮箱监听") }],
  }),
  pendingComponent: () => <StudioTablePageSkeleton columnCount={10} label="邮箱监听" />,
});
