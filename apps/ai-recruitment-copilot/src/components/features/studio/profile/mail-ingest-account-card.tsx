"use client";

import { IconDeviceFloppy, IconInbox, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  SettingsGroup,
  SettingsSection,
} from "@/components/features/studio/profile/profile-settings-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
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
import { formatDateOnly } from "@arc/shared/utils/time";
import {
  dateTimeLocalInputToISOString,
  isoStringToDateTimeLocalInput,
} from "@/lib/client/datetime-local";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
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
const DEFAULT_MAIL_INGEST_FORM = {
  emailAddress: "",
  enabled: true,
  imapHost: DEFAULT_MAIL_INGEST_PROVIDER.imapHost,
  imapPort: DEFAULT_MAIL_INGEST_PROVIDER.imapPort,
  listenStartAt: "",
  password: "",
  providerId: DEFAULT_MAIL_INGEST_PROVIDER_ID as MailIngestProviderId,
  subjectKeyword: "boss直聘",
  username: "",
};

interface MailIngestAccountRecord {
  emailAddress: string;
  enabled: boolean;
  hasPassword: boolean;
  id: string;
  imapHost: string;
  imapPort: number;
  lastCheckedAt: string | null;
  lastError: string | null;
  listenStartAt: string | null;
  subjectKeyword: string;
  username: string;
}

interface MailIngestFormState {
  emailAddress: string;
  enabled: boolean;
  imapHost: string;
  imapPort: string;
  listenStartAt: string;
  password: string;
  providerId: MailIngestProviderId;
  subjectKeyword: string;
  username: string;
}

function createDefaultMailIngestForm(): MailIngestFormState {
  return {
    ...DEFAULT_MAIL_INGEST_FORM,
    listenStartAt: isoStringToDateTimeLocalInput(new Date().toISOString()),
  };
}

function formFromAccount(account: MailIngestAccountRecord | null): MailIngestFormState {
  if (!account) {
    return createDefaultMailIngestForm();
  }
  return {
    emailAddress: account.emailAddress,
    enabled: account.enabled,
    imapHost: account.imapHost,
    imapPort: String(account.imapPort),
    listenStartAt: isoStringToDateTimeLocalInput(account.listenStartAt),
    password: "",
    providerId: resolveMailIngestProviderId(account.imapHost, account.imapPort),
    subjectKeyword: account.subjectKeyword,
    username: account.username,
  };
}

export function MailIngestAccountCard() {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MailIngestFormState>(() => createDefaultMailIngestForm());

  const accountsQuery = useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["mail-ingest-accounts"].$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载邮箱采集配置失败");
      }
      return (await response.json()) as { accounts: MailIngestAccountRecord[] };
    },
    queryKey: ["mail-ingest-accounts", slug],
  });

  const account = accountsQuery.data?.accounts[0] ?? null;

  function openEditor() {
    setForm(formFromAccount(account));
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const port = Number.parseInt(form.imapPort, 10);
      if (!(Number.isFinite(port) && port > 0)) {
        throw new Error("IMAP 端口无效");
      }
      if (!(form.emailAddress.trim() && form.username.trim())) {
        throw new Error("邮箱地址和登录账号不能为空");
      }
      const payload = {
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
      const response = account
        ? await rpc.api.w[":slug"].studio["mail-ingest-accounts"][":id"].$patch({
            json: {
              ...payload,
              ...(form.password.trim() ? { password: form.password.trim() } : {}),
            },
            param: { id: account.id, slug },
          })
        : await rpc.api.w[":slug"].studio["mail-ingest-accounts"].$post({
            json: {
              ...payload,
              password: form.password.trim(),
            },
            param: { slug },
          });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "邮箱采集配置保存失败");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "邮箱采集配置保存失败");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mail-ingest-accounts", slug] });
      toast.success("邮箱采集配置已保存");
      setOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!account) {
        return;
      }
      const response = await rpc.api.w[":slug"].studio["mail-ingest-accounts"][":id"].$delete({
        param: { id: account.id, slug },
      });
      if (!response.ok) {
        throw new Error("邮箱采集配置删除失败");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "邮箱采集配置删除失败");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mail-ingest-accounts", slug] });
      toast.success("邮箱采集配置已删除");
      setOpen(false);
    },
  });

  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;
  const disabled = saving || deleting || accountsQuery.isLoading;

  let statusLine = "worker 开启后每 15 分钟轮询一次";
  if (account?.lastCheckedAt) {
    statusLine = `上次轮询：${formatDateOnly(account.lastCheckedAt)}`;
  } else if (!account) {
    statusLine = "尚未配置采集邮箱";
  }

  return (
    <>
      <SettingsSection
        description="轮询 Boss 直聘简历邮件，自动加入你的私有招聘台解析队列。"
        title="简历邮箱采集"
      >
        <SettingsGroup>
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                <IconInbox className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">
                  {account ? account.emailAddress : "未配置邮箱"}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {account
                    ? `${account.enabled ? "已启用" : "已停用"} · ${statusLine}`
                    : statusLine}
                </p>
              </div>
            </div>
            <Button onClick={openEditor} size="sm" type="button" variant="outline">
              {account ? "编辑简历邮箱采集信息" : "配置简历邮箱采集"}
            </Button>
          </div>
        </SettingsGroup>
        {account?.lastError ? (
          <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
            {account.lastError}
          </p>
        ) : null}
      </SettingsSection>

      <Modal
        description="配置 IMAP 账号后，系统会按关键字轮询并导入简历。"
        footer={
          <>
            {account ? (
              <Button
                className="sm:mr-auto"
                disabled={disabled}
                onClick={() => deleteMutation.mutate()}
                type="button"
                variant="outline"
              >
                {deleting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconTrash data-icon="inline-start" />
                )}
                删除
              </Button>
            ) : null}
            <Button onClick={() => setOpen(false)} type="button" variant="outline">
              取消
            </Button>
            <Button disabled={disabled} form="mail-ingest-form" type="submit">
              {saving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存配置
            </Button>
          </>
        }
        onOpenChange={setOpen}
        open={open}
        size="lg"
        title="编辑简历邮箱采集信息"
      >
        <form
          className="flex flex-col gap-4"
          id="mail-ingest-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="font-medium text-sm">启用采集</p>
              <p className="text-muted-foreground text-xs">关闭后停止轮询该邮箱。</p>
            </div>
            <Switch
              checked={form.enabled}
              disabled={disabled}
              onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
            />
          </div>

          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="mail-ingest-email">邮箱地址</FieldLabel>
              <Input
                id="mail-ingest-email"
                autoComplete="email"
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailAddress: event.target.value }))
                }
                placeholder="hr@example.com"
                type="email"
                value={form.emailAddress}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="mail-ingest-username">登录账号</FieldLabel>
              <Input
                id="mail-ingest-username"
                autoComplete="username"
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="通常与邮箱地址相同"
                value={form.username}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="mail-ingest-password">客户端密码</FieldLabel>
              <Input
                id="mail-ingest-password"
                autoComplete="new-password"
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={account?.hasPassword ? "留空则不修改" : "请输入阿里邮箱客户端密码"}
                type="password"
                value={form.password}
              />
              <FieldDescription>
                密码会加密保存；阿里企业邮箱需开启 IMAP/SMTP 服务。
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="mail-ingest-provider">邮箱服务</FieldLabel>
              <Select
                disabled={disabled}
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
              <FieldDescription>
                IMAP：{form.imapHost}:{form.imapPort}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="mail-ingest-keyword">标题关键字</FieldLabel>
              <Input
                id="mail-ingest-keyword"
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subjectKeyword: event.target.value }))
                }
                value={form.subjectKeyword}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="mail-ingest-listen-start">监听起始时间</FieldLabel>
              <DateTimePicker
                id="mail-ingest-listen-start"
                disabled={disabled}
                onValueChange={(listenStartAt) =>
                  setForm((current) => ({ ...current, listenStartAt }))
                }
                value={form.listenStartAt}
              />
              <FieldDescription>留空表示扫描全部邮件；新建时默认从当前时间开始。</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </Modal>
    </>
  );
}
