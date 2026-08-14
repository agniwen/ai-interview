"use client";

import { IconBuilding, IconInbox } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  estimateActionsColumnSize,
  useDataGridState,
} from "@/components/data-grid";
import type { DataGridFetchParams, DataGridFetchResult } from "@/components/data-grid";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import { TimeDisplay } from "@/components/features/display/time-display";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { rpcFetch } from "@/lib/client/api";
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
import { rpc } from "@/lib/client/rpc";

const DEFAULT_MAIL_INGEST_PROVIDER = getMailIngestProvider(DEFAULT_MAIL_INGEST_PROVIDER_ID);
const DEFAULT_FORM = {
  emailAddress: "",
  enabled: true,
  imapHost: DEFAULT_MAIL_INGEST_PROVIDER.imapHost,
  imapPort: DEFAULT_MAIL_INGEST_PROVIDER.imapPort,
  listenStartAt: "",
  password: "",
  providerId: DEFAULT_MAIL_INGEST_PROVIDER_ID as MailIngestProviderId,
  subjectKeyword: "boss直聘",
  userId: "",
  username: "",
};

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

interface PlatformMailIngestAccountRow {
  account: MailIngestAccountRecord | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    email: string;
    id: string;
    image: string | null;
    name: string;
    role: string;
  };
}

interface PlatformMailIngestAccountsResult extends DataGridFetchResult<PlatformMailIngestAccountRow> {
  page: number;
  pageSize: number;
}

type PlatformMailIngestSortBy = "emailAddress" | "lastCheckedAt" | "userEmail" | "userName";

const SORT_IDS = ["userName", "userEmail", "emailAddress", "lastCheckedAt"] as const;

interface MailIngestFormState {
  emailAddress: string;
  enabled: boolean;
  imapHost: string;
  imapPort: string;
  listenStartAt: string;
  password: string;
  providerId: MailIngestProviderId;
  subjectKeyword: string;
  userId: string;
  username: string;
}

function buildNewForm(user: PlatformMailIngestAccountRow["user"]): MailIngestFormState {
  return {
    ...DEFAULT_FORM,
    emailAddress: user.email,
    listenStartAt: isoStringToDateTimeLocalInput(new Date().toISOString()),
    userId: user.id,
    username: user.email,
  };
}

function roleLabel(role: string) {
  if (role === "owner") {
    return "所有者";
  }
  if (role === "admin") {
    return "管理员";
  }
  if (role === "member") {
    return "成员";
  }
  return role;
}

function buildInitialForm(row: PlatformMailIngestAccountRow): MailIngestFormState {
  if (row.account) {
    return {
      emailAddress: row.account.emailAddress,
      enabled: row.account.enabled,
      imapHost: row.account.imapHost,
      imapPort: String(row.account.imapPort),
      listenStartAt: isoStringToDateTimeLocalInput(row.account.listenStartAt),
      password: "",
      providerId: resolveMailIngestProviderId(row.account.imapHost, row.account.imapPort),
      subjectKeyword: row.account.subjectKeyword,
      userId: row.user.id,
      username: row.account.username,
    };
  }

  return buildNewForm(row.user);
}

function toPayload(form: MailIngestFormState) {
  const port = Number.parseInt(form.imapPort, 10);
  if (!(Number.isFinite(port) && port > 0)) {
    throw new Error("IMAP 端口无效");
  }
  if (!(form.emailAddress.trim() && form.username.trim())) {
    throw new Error("邮箱地址和登录账号不能为空");
  }

  return {
    emailAddress: form.emailAddress.trim(),
    enabled: form.enabled,
    failedMailbox: "ARC-Failed",
    imapHost: form.imapHost.trim(),
    imapPort: port,
    imapSecure: true,
    listenStartAt: dateTimeLocalInputToISOString(form.listenStartAt),
    mailbox: "INBOX",
    processedMailbox: "ARC-Processed",
    subjectKeyword: form.subjectKeyword.trim() || "boss直聘",
    username: form.username.trim(),
  };
}

function PlatformMailIngestAccountDialog({
  onOpenChange,
  open,
  row,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  row: PlatformMailIngestAccountRow | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MailIngestFormState>(DEFAULT_FORM);

  useEffect(() => {
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
        await rpcFetch<MailIngestAccountRecord>(
          rpc.api.platform["mail-ingest-accounts"][":id"].$patch({
            json: {
              ...payload,
              organizationId: row.organization.id,
              ...(password ? { password } : {}),
            },
            param: { id: row.account.id },
          }),
          "邮箱监听配置更新失败",
        );
        return;
      }

      if (!password) {
        throw new Error("新建配置时必须填写客户端密码");
      }
      await rpcFetch<MailIngestAccountRecord>(
        rpc.api.platform["mail-ingest-accounts"].$post({
          json: {
            ...payload,
            organizationId: row.organization.id,
            password,
            userId: form.userId,
          },
        }),
        "邮箱监听配置保存失败",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "邮箱监听配置保存失败");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-mail-ingest-accounts"] });
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
          <DialogTitle>{isEdit ? "编辑邮箱监听" : "新建邮箱监听"}</DialogTitle>
          <DialogDescription>
            {row
              ? `${row.organization.name} · ${row.user.name || row.user.email} · ${row.user.email}`
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
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-user">成员</FieldLabel>
              <Select disabled value={form.userId}>
                <SelectTrigger id="platform-mail-ingest-user" className="w-full">
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
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-email">监听邮箱</FieldLabel>
              <Input
                id="platform-mail-ingest-email"
                autoComplete="email"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailAddress: event.target.value }))
                }
                placeholder="hr@example.com"
                type="email"
                value={form.emailAddress}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-username">登录账号</FieldLabel>
              <Input
                id="platform-mail-ingest-username"
                autoComplete="username"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="通常与邮箱地址相同"
                value={form.username}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-password">客户端密码</FieldLabel>
              <Input
                id="platform-mail-ingest-password"
                autoComplete="new-password"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={isEdit ? "留空则不修改" : "请输入邮箱客户端密码"}
                type="password"
                value={form.password}
              />
              <FieldDescription>密码会加密保存；企业邮箱需开启 IMAP/SMTP 服务。</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-provider">邮箱服务</FieldLabel>
              <Select
                disabled={pending}
                value={form.providerId}
                onValueChange={(value) =>
                  setForm((current) =>
                    applyMailIngestProvider(
                      { ...current, providerId: value as MailIngestProviderId },
                      value as MailIngestProviderId,
                    ),
                  )
                }
              >
                <SelectTrigger className="w-full" id="platform-mail-ingest-provider">
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
              <FieldDescription>
                IMAP：{form.imapHost}:{form.imapPort}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-keyword">标题关键字</FieldLabel>
              <Input
                id="platform-mail-ingest-keyword"
                disabled={pending}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subjectKeyword: event.target.value }))
                }
                value={form.subjectKeyword}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="platform-mail-ingest-listen-start">监听起始时间</FieldLabel>
              <DateTimePicker
                id="platform-mail-ingest-listen-start"
                disabled={pending}
                onValueChange={(listenStartAt) =>
                  setForm((current) => ({ ...current, listenStartAt }))
                }
                value={form.listenStartAt}
              />
              <FieldDescription>留空表示扫描全部邮件；新建时默认从当前时间开始。</FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Switch
                checked={form.enabled}
                disabled={pending}
                id="platform-mail-ingest-enabled"
                onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
              />
              <FieldLabel htmlFor="platform-mail-ingest-enabled">启用监听</FieldLabel>
            </Field>
          </FieldGroup>

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

export function PlatformMailIngestAccountsGrid() {
  const [editingRow, setEditingRow] = useState<PlatformMailIngestAccountRow | null>(null);

  function normalizeSortBy(sortBy: string | undefined): PlatformMailIngestSortBy | undefined {
    return SORT_IDS.find((id) => id === sortBy);
  }

  function fetchMailIngestAccounts(
    params: DataGridFetchParams<Record<string, never>>,
  ): Promise<PlatformMailIngestAccountsResult> {
    const sortBy = normalizeSortBy(params.sortBy);

    return rpcFetch<PlatformMailIngestAccountsResult>(
      rpc.api.platform["mail-ingest-accounts"].$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          ...(params.search ? { search: params.search } : {}),
          ...(sortBy ? { sortBy } : {}),
          ...(params.sortOrder ? { sortOrder: params.sortOrder } : {}),
        },
      }),
      "加载邮箱监听列表失败",
    );
  }

  const grid = useDataGridState<PlatformMailIngestAccountRow, Record<string, never>>({
    allowedSortIds: [...SORT_IDS],
    defaultSorting: [{ desc: false, id: "userName" }],
    initialFilters: {},
    queryFn: fetchMailIngestAccounts,
    queryKeyBase: ["platform-mail-ingest-accounts"],
  });

  const columns = useMemo(
    () => [
      customColumn<PlatformMailIngestAccountRow>({
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <IconBuilding className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{row.organization.name}</p>
              <p className="truncate text-muted-foreground text-xs">{row.organization.slug}</p>
            </div>
          </div>
        ),
        key: "organizationName",
        title: "工作区",
      }),
      customColumn<PlatformMailIngestAccountRow>({
        cell: (row) => (
          <MemberCell email={row.user.email} image={row.user.image} name={row.user.name} />
        ),
        key: "userName",
        title: "成员",
      }),
      customColumn<PlatformMailIngestAccountRow>({
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
      customColumn<PlatformMailIngestAccountRow>({
        cell: (row) => (
          <Badge variant={row.user.role === "owner" ? "default" : "outline"}>
            {roleLabel(row.user.role)}
          </Badge>
        ),
        key: "role",
        title: "角色",
      }),
      customColumn<PlatformMailIngestAccountRow>({
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
      customColumn<PlatformMailIngestAccountRow>({
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
      customColumn<PlatformMailIngestAccountRow>({
        cell: (row) => row.account?.subjectKeyword ?? "-",
        key: "subjectKeyword",
        title: "标题关键字",
      }),
      customColumn<PlatformMailIngestAccountRow>({
        cell: (row) =>
          row.account ? (
            <TimeDisplay value={row.account.listenStartAt} emptyText="扫描全部" as="span" />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        key: "listenStartAt",
        title: "监听起始",
      }),
      customColumn<PlatformMailIngestAccountRow>({
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
      actionsColumn<PlatformMailIngestAccountRow>({
        inline: [
          {
            label: "编辑",
            onClick: (row) => setEditingRow(row),
            show: (row) => Boolean(row.account),
          },
          {
            label: "新建",
            onClick: (row) => setEditingRow(row),
            show: (row) => !row.account,
          },
        ],
        // “编辑”和“新建”互斥显示，按单个最长按钮计算列宽。
        size: estimateActionsColumnSize({ inlineLabels: ["编辑"] }),
      }),
    ],
    [],
  );

  return (
    <>
      <DataGrid<PlatformMailIngestAccountRow>
        {...grid.bind}
        columnPinning={{ end: ["actions"] }}
        columns={columns}
        empty={
          <Empty className="border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconInbox />
              </EmptyMedia>
              <EmptyTitle>{grid.search ? "没有匹配的邮箱监听配置" : "暂无邮箱监听数据"}</EmptyTitle>
              <EmptyDescription>
                {grid.search ? "调整搜索关键词后重试。" : "平台内还没有可展示的工作区成员。"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        filters={[
          {
            key: "search",
            minWidth: "20rem",
            placeholder: "搜索工作区、成员、邮箱、IMAP 或标题关键字",
            type: "search",
          },
        ]}
        getRowId={(row) => `${row.organization.id}:${row.user.id}:${row.account?.id ?? "empty"}`}
      />

      <PlatformMailIngestAccountDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
          }
        }}
        open={editingRow !== null}
        row={editingRow}
      />
    </>
  );
}
