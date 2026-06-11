import { createFileRoute } from "@tanstack/react-router";
import { Building2Icon, MailIcon, SaveIcon, UserIcon } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/studio/page-header";
import { getWorkspaceRoleLabel } from "@/components/studio/members/role-display";
import type { WorkspaceRole } from "@/components/studio/members/role-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { formatDateOnly } from "@arc/shared/utils/time";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/client/auth-client";

const WHITESPACE_REGEX = /\s+/u;

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  member: "secondary",
  owner: "default",
};

const PROFILE_NAME_MAX_LENGTH = 120;
const PROFILE_IMAGE_URL_MAX_LENGTH = 2048;

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
            <UserIcon />
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
            <MailIcon />
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
            <Building2Icon />
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
            {pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            {pending ? "保存中" : "保存修改"}
          </Button>
        </div>
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
    <div className="flex flex-col gap-6">
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
