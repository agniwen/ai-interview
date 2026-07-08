import {
  IconBuilding,
  IconDeviceFloppy,
  IconInbox,
  IconMail,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PermissionGate } from "@/components/features/permission/permission-gate";
import { PageHeader } from "@/components/features/studio/page-header";
import { getWorkspaceRoleLabel } from "@/components/features/studio/members/role-display";
import type { WorkspaceRole } from "@/components/features/studio/members/role-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { formatDateOnly } from "@arc/shared/utils/time";
import {
  dateTimeLocalInputToISOString,
  isoStringToDateTimeLocalInput,
} from "@/lib/client/datetime-local";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/client/auth-client";
import {
  DEFAULT_MAIL_INGEST_PROVIDER_ID,
  MAIL_INGEST_PROVIDERS,
  applyMailIngestProvider,
  getMailIngestProvider,
  resolveMailIngestProviderId,
} from "@/lib/client/mail-ingest-providers";
import type { MailIngestProviderId } from "@/lib/client/mail-ingest-providers";
import { rpc } from "@/lib/client/rpc";

const WHITESPACE_REGEX = /\s+/u;

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  member: "secondary",
  noAccess: "outline",
  owner: "default",
};

const PROFILE_NAME_MAX_LENGTH = 120;
const PROFILE_IMAGE_URL_MAX_LENGTH = 2048;
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

// 用共享的 formatDateOnly 而不是页面本地版本，保证全应用日期格式一致 (`YY/MM/DD`)。
// Use the shared formatDateOnly so dates render identically everywhere (`YY/MM/DD`).

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

interface ProfileSummaryProps {
  email?: string | null;
  emailVerified?: boolean;
  image: string;
  name: string;
  tenantName: string | null;
}

function ProfileSummary({ email, emailVerified, image, name, tenantName }: ProfileSummaryProps) {
  const displayName = name || "未命名用户";

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-muted/30 p-4 sm:flex-row sm:items-center">
      <Avatar className="size-14" size="lg">
        <AvatarImage alt={displayName} src={image} />
        <AvatarFallback>{getInitials(name, email)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{displayName}</p>
          {emailVerified ? <Badge variant="secondary">邮箱已验证</Badge> : null}
        </div>
        <p className="truncate text-muted-foreground text-sm">{email ?? "加载中"}</p>
        {tenantName ? (
          <p className="truncate text-muted-foreground text-xs">飞书租户：{tenantName}</p>
        ) : null}
      </div>
    </div>
  );
}

interface ProfileFieldsProps {
  email: string;
  image: string;
  isPending: boolean;
  name: string;
  onImageChange: (value: string) => void;
  onNameChange: (value: string) => void;
}

function ProfileFields({
  email,
  image,
  isPending,
  name,
  onImageChange,
  onNameChange,
}: ProfileFieldsProps) {
  return (
    <FieldGroup className="gap-5">
      <Field>
        <FieldLabel htmlFor="profile-name">姓名</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <IconUser />
          </InputGroupAddon>
          <InputGroupInput
            id="profile-name"
            autoComplete="name"
            disabled={isPending}
            maxLength={PROFILE_NAME_MAX_LENGTH}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="请输入姓名"
            value={name}
          />
        </InputGroup>
        <FieldDescription>用于成员列表、邀请记录和个人菜单展示。</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="profile-image">头像 URL</FieldLabel>
        <Input
          id="profile-image"
          disabled={isPending}
          maxLength={PROFILE_IMAGE_URL_MAX_LENGTH}
          onChange={(event) => onImageChange(event.target.value)}
          placeholder="https://example.com/avatar.png"
          type="url"
          value={image}
        />
        <FieldDescription>留空会显示姓名首字母头像。</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="profile-email">登录邮箱</FieldLabel>
        <InputGroup data-disabled>
          <InputGroupAddon>
            <IconMail />
          </InputGroupAddon>
          <InputGroupInput id="profile-email" disabled readOnly value={email} />
        </InputGroup>
      </Field>
    </FieldGroup>
  );
}

interface OrganizationCardProps {
  currentRole: WorkspaceRole | null;
  currentSlug: string;
  organizations: {
    createdAt: Date | string;
    id: string;
    name: string;
    slug: string;
  }[];
}

function OrganizationCard({ currentRole, currentSlug, organizations }: OrganizationCardProps) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>我的工作区</CardTitle>
        <CardDescription>当前账号已加入的工作区与当前工作区角色。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs">
            <IconBuilding />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">已加入 {organizations.length} 个工作区</p>
            <p className="text-muted-foreground text-sm">当前工作区：{currentSlug}</p>
          </div>
          {currentRole ? (
            <Badge variant={ROLE_BADGE_VARIANT[currentRole]}>
              {getWorkspaceRoleLabel(currentRole)}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {organizations.map((organization) => {
            const isActive = organization.slug === currentSlug;
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                key={organization.id}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-sm">{organization.name}</p>
                    {isActive ? <Badge variant="secondary">当前</Badge> : null}
                  </div>
                  <p className="truncate text-muted-foreground text-xs">
                    /w/{organization.slug} · 加入于 {formatDateOnly(organization.createdAt)}
                  </p>
                </div>
                {isActive && currentRole ? (
                  <Badge variant={ROLE_BADGE_VARIANT[currentRole]}>
                    {getWorkspaceRoleLabel(currentRole)}
                  </Badge>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface ProfileCardProps {
  dirty: boolean;
  email: string;
  emailVerified?: boolean;
  image: string;
  isPending: boolean;
  name: string;
  onImageChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
  pending: boolean;
  tenantName: string | null;
}

function ProfileCard({
  dirty,
  email,
  emailVerified,
  image,
  isPending,
  name,
  onImageChange,
  onNameChange,
  onSave,
  pending,
  tenantName,
}: ProfileCardProps) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>账号资料</CardTitle>
        <CardDescription>这些信息会显示在工作区成员列表和个人菜单中。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ProfileSummary
          email={email}
          emailVerified={emailVerified}
          image={image}
          name={name}
          tenantName={tenantName}
        />

        <Separator />

        <ProfileFields
          email={email}
          image={image}
          isPending={isPending}
          name={name}
          onImageChange={onImageChange}
          onNameChange={onNameChange}
        />

        <div className="flex justify-end">
          <Button disabled={pending || isPending || !dirty} onClick={onSave}>
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <IconDeviceFloppy data-icon="inline-start" />
            )}
            {pending ? "保存中" : "保存修改"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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

function MailIngestAccountCard() {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (!account) {
      setForm(createDefaultMailIngestForm());
      return;
    }
    setForm({
      emailAddress: account.emailAddress,
      enabled: account.enabled,
      imapHost: account.imapHost,
      imapPort: String(account.imapPort),
      listenStartAt: isoStringToDateTimeLocalInput(account.listenStartAt),
      password: "",
      providerId: resolveMailIngestProviderId(account.imapHost, account.imapPort),
      subjectKeyword: account.subjectKeyword,
      username: account.username,
    });
  }, [account]);

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
    },
  });

  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;
  const disabled = saving || deleting || accountsQuery.isLoading;

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>简历邮箱采集</CardTitle>
        <CardDescription>轮询 Boss 直聘简历邮件，自动加入你的私有招聘台解析队列。</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
                <IconInbox />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {account ? account.emailAddress : "未配置邮箱"}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                  {account?.lastCheckedAt
                    ? `上次轮询：${formatDateOnly(account.lastCheckedAt)}`
                    : "worker 开启后每 15 分钟轮询一次"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">启用</span>
              <Switch
                checked={form.enabled}
                disabled={disabled}
                onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
              />
            </div>
          </div>

          {account?.lastError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              {account.lastError}
            </p>
          ) : null}

          <FieldGroup className="gap-5">
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
              <Input
                id="mail-ingest-listen-start"
                disabled={disabled}
                onChange={(event) =>
                  setForm((current) => ({ ...current, listenStartAt: event.target.value }))
                }
                type="datetime-local"
                value={form.listenStartAt}
              />
              <FieldDescription>留空表示扫描全部邮件；新建时默认从当前时间开始。</FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex justify-end gap-2">
            {account ? (
              <Button
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
            <Button disabled={disabled} type="submit">
              {saving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存配置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MyProfilePage() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const { data: listOrganizations } = authClient.useListOrganizations();
  const currentSlug = useWorkspaceSlug();
  const workspaceMemberRole = useWorkspaceMemberRole() as WorkspaceRole;
  const user = session?.user;
  const organizations = listOrganizations ?? [];
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setName(user?.name ?? "");
    setImage(user?.image ?? "");
  }, [user?.name, user?.image]);

  const normalizedImage = image.trim();
  const trimmedName = name.trim();
  const currentImage = user?.image ?? "";
  const dirty = trimmedName !== (user?.name ?? "") || normalizedImage !== currentImage;

  const tenantName = useMemo(() => {
    const maybeUser = user as { feishuTenantName?: string | null } | undefined;
    return maybeUser?.feishuTenantName ?? null;
  }, [user]);

  const currentRole = workspaceMemberRole;

  function onSave() {
    if (!trimmedName) {
      toast.error("姓名不能为空");
      return;
    }

    startTransition(async () => {
      const { error } = await authClient.updateUser({
        image: normalizedImage || null,
        name: trimmedName,
      });
      if (error) {
        toast.error(error.message ?? "保存失败");
        return;
      }
      await refetch();
      toast.success("个人信息已更新");
    });
  }

  return (
    <div className="mx-auto w-full max-w-[96em] flex flex-col gap-6">
      <PageHeader
        title="我的信息"
        description="更新你在工作区里的展示姓名和头像，方便同事识别每一次配置和操作。"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileCard
          dirty={dirty}
          email={user?.email ?? ""}
          emailVerified={user?.emailVerified}
          image={normalizedImage}
          isPending={isPending}
          name={trimmedName || user?.name || ""}
          onImageChange={setImage}
          onNameChange={setName}
          onSave={onSave}
          pending={pending}
          tenantName={tenantName}
        />

        <OrganizationCard
          currentRole={currentRole}
          currentSlug={currentSlug}
          organizations={organizations}
        />

        <PermissionGate resource="member" action="update">
          <MailIngestAccountCard />
        </PermissionGate>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/me")({
  component: MyProfilePage,
  head: () => ({
    meta: [{ title: "我的信息" }],
  }),
});
