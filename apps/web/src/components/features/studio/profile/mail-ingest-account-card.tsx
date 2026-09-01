"use client";
import { apiResponse } from "@/lib/client/api/rpc-fetch";
import {
  createOwnWorkspaceMailIngestAccount,
  deleteOwnWorkspaceMailIngestAccount,
  listOwnWorkspaceMailIngestAccounts,
  updateOwnWorkspaceMailIngestAccount,
} from "@/lib/client/backend-api";

import { IconDeviceFloppy, IconInbox, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  SettingsGroup,
  SettingsSection,
  SettingsRow,
} from "@/components/features/studio/profile/profile-settings-ui";
import { Button } from "@/components/ui/button";
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
import {
  DEFAULT_MAIL_INGEST_PLATFORM_ID,
  MAIL_INGEST_PLATFORMS,
  getMailIngestPlatform,
  isMailIngestPlatformId,
  resolveMailIngestPlatformId,
} from "@/lib/client/mail-ingest-platforms";
import type { MailIngestPlatformId } from "@/lib/client/mail-ingest-platforms";

const DEFAULT_MAIL_INGEST_PROVIDER = getMailIngestProvider(DEFAULT_MAIL_INGEST_PROVIDER_ID);

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
  monitoringPlatform: MailIngestPlatformId;
}

const DEFAULT_MAIL_INGEST_FORM = {
  emailAddress: "",
  enabled: true,
  imapHost: DEFAULT_MAIL_INGEST_PROVIDER.imapHost,
  imapPort: DEFAULT_MAIL_INGEST_PROVIDER.imapPort,
  listenStartAt: "",
  monitoringPlatform: DEFAULT_MAIL_INGEST_PLATFORM_ID,
  password: "",
  providerId: DEFAULT_MAIL_INGEST_PROVIDER_ID,
} satisfies MailIngestFormState;

const errorPayloadSchema = z.object({ error: z.string().optional() }).nullable();

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
    monitoringPlatform: resolveMailIngestPlatformId(account.subjectKeyword),
    password: "",
    providerId: resolveMailIngestProviderId(account.imapHost, account.imapPort),
  };
}

export function MailIngestAccountCard() {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MailIngestFormState>(() => createDefaultMailIngestForm());

  const accountsQuery = useQuery({
    queryFn: async () => {
      const response = await apiResponse(
        listOwnWorkspaceMailIngestAccounts({ path: { workspaceSlug: slug } }),
      );

      if (!response.ok) {
        throw new Error("加载邮箱采集配置失败");
      }
      return await response.json();
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
      const emailAddress = form.emailAddress.trim();
      if (!emailAddress) {
        throw new Error("监听邮箱不能为空");
      }
      const payload = {
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
      const response = account
        ? await apiResponse(
            updateOwnWorkspaceMailIngestAccount({
              body: form.password.trim() ? { ...payload, password: form.password.trim() } : payload,
              path: { id: account.id, workspaceSlug: slug },
            }),
          )
        : await apiResponse(
            createOwnWorkspaceMailIngestAccount({
              body: { ...payload, password: form.password.trim() },
              path: { workspaceSlug: slug },
            }),
          );

      if (!response.ok) {
        const rawBody = await response.json().catch(() => null);
        const parsedBody = errorPayloadSchema.safeParse(rawBody);
        const body = parsedBody.success ? parsedBody.data : null;
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
      const response = await apiResponse(
        deleteOwnWorkspaceMailIngestAccount({ path: { id: account.id, workspaceSlug: slug } }),
      );

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

  let statusLine = "每 15 分钟检查一次新邮件";
  if (account?.lastCheckedAt) {
    statusLine = `上次轮询：${formatDateOnly(account.lastCheckedAt)}`;
  } else if (!account) {
    statusLine = "尚未配置采集邮箱";
  }

  return (
    <>
      <SettingsSection description="符合条件的简历邮件会自动导入你的招聘台。" title="简历邮箱采集">
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
        title="简历邮箱采集设置"
      >
        <form
          className="flex flex-col gap-4"
          id="mail-ingest-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <SettingsGroup>
            <SettingsRow
              description="用于接收简历邮件，也会作为邮箱登录账号提交。"
              htmlFor="mail-ingest-email"
              label="监听邮箱"
            >
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
            </SettingsRow>

            <SettingsRow
              description="密码会加密保存；已配置密码时留空则不修改。"
              htmlFor="mail-ingest-password"
              label="客户端密码"
            >
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
            </SettingsRow>

            <SettingsRow
              description={`IMAP：${form.imapHost}:${form.imapPort}`}
              htmlFor="mail-ingest-provider"
              label="邮箱服务"
            >
              <Select
                disabled={disabled}
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
                disabled={disabled}
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
                disabled={disabled}
                onValueChange={(listenStartAt) =>
                  setForm((current) => ({ ...current, listenStartAt }))
                }
                value={form.listenStartAt}
              />
            </SettingsRow>

            <SettingsRow description="关闭后停止轮询该邮箱。" label="启用采集">
              <Switch
                checked={form.enabled}
                disabled={disabled}
                id="mail-ingest-enabled"
                onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
              />
            </SettingsRow>
          </SettingsGroup>
        </form>
      </Modal>
    </>
  );
}
